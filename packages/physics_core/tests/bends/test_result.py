import json
import math
from collections.abc import Callable

import pytest
from pydantic import ValidationError

from fibre_sim.bends import (
    MAX_MACROBENDS,
    MacrobendInput,
    MacrobendLossManifest,
    MacrobendLossPoint,
    MacrobendLossRequest,
    MacrobendLossResult,
    calculate_macrobend_loss,
)

ASSUMPTION_TERMS = ("supplied", "loss", "additive", "dB")
LIMITATION_TERMS = ("radius", "angle", "position")


def make_bend(**overrides: object) -> MacrobendInput:
    values: dict[str, object] = {
        "position_fraction": 0.25,
        "radius_mm": 10.0,
        "angle_deg": 90.0,
        "supplied_loss_db": 1.5,
    }
    values.update(overrides)
    return MacrobendInput.model_validate(values)


def make_request(**overrides: object) -> MacrobendLossRequest:
    values: dict[str, object] = {
        "input_power_dbm": -3.0,
        "bends": (make_bend(),),
    }
    values.update(overrides)
    return MacrobendLossRequest.model_validate(values)


def make_point(**overrides: object) -> MacrobendLossPoint:
    values: dict[str, object] = {
        "position_fraction": 0.25,
        "radius_mm": 10.0,
        "angle_deg": 90.0,
        "supplied_loss_db": 1.5,
        "cumulative_bend_loss_db": 1.5,
        "output_power_dbm": -4.5,
    }
    values.update(overrides)
    return MacrobendLossPoint.model_validate(values)


def make_result(**overrides: object) -> MacrobendLossResult:
    values: dict[str, object] = {
        "input_power_dbm": -3.0,
        "total_bend_loss_db": 1.5,
        "output_power_dbm": -4.5,
        "bends": (make_point(),),
        "model_manifest": MacrobendLossManifest(),
    }
    values.update(overrides)
    return MacrobendLossResult.model_validate(values)


def test_manifest_has_exact_fields_and_literal_values() -> None:
    manifest = MacrobendLossManifest()

    assert list(MacrobendLossManifest.model_fields) == [
        "model_id",
        "model_version",
        "loss_source",
        "aggregation",
        "assumptions",
        "limitations",
    ]
    assert manifest.model_id == "user_supplied_macrobend_loss"
    assert manifest.model_version == "1.0.0"
    assert manifest.loss_source == "user_supplied"
    assert manifest.aggregation == "additive_db"


def test_manifest_fidelity_language_describes_supplied_additive_loss_and_metadata() -> None:
    manifest = MacrobendLossManifest()
    language = " ".join((*manifest.assumptions, *manifest.limitations)).lower()

    assert all(term.lower() in language for term in ASSUMPTION_TERMS)
    assert all(term.lower() in language for term in LIMITATION_TERMS)
    assert "not" in language or "does not" in language
    assert "derive" in language or "affect" in language or "alter" in language


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("model_id", "other_model"),
        ("model_version", "2.0.0"),
        ("loss_source", "inferred"),
        ("aggregation", "linear_power"),
    ],
)
def test_manifest_rejects_alternative_literal_values(field: str, value: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        MacrobendLossManifest.model_validate({field: value})

    assert exc_info.value.errors()[0]["type"] == "literal_error"


def test_manifest_collections_are_immutable_tuples_and_json_arrays() -> None:
    manifest = MacrobendLossManifest.model_validate(
        {"assumptions": ["supplied loss"], "limitations": ["metadata only"]}
    )

    assert isinstance(manifest.assumptions, tuple)
    assert isinstance(manifest.limitations, tuple)
    assert manifest.assumptions == ("supplied loss",)
    assert manifest.limitations == ("metadata only",)
    append_method = "append"
    with pytest.raises(AttributeError):
        getattr(manifest.assumptions, append_method)("forbidden")

    assert json.loads(manifest.model_dump_json()) == manifest.model_dump(mode="json")


def test_point_has_exact_fields_and_echoes_bend_metadata() -> None:
    point = make_point()

    assert list(MacrobendLossPoint.model_fields) == [
        "position_fraction",
        "radius_mm",
        "angle_deg",
        "supplied_loss_db",
        "cumulative_bend_loss_db",
        "output_power_dbm",
    ]
    assert point.position_fraction == 0.25
    assert point.radius_mm == 10.0
    assert point.angle_deg == 90.0
    assert point.supplied_loss_db == 1.5
    assert point.cumulative_bend_loss_db == 1.5
    assert point.output_power_dbm == -4.5


def test_result_has_exact_aggregate_fields() -> None:
    result = make_result()

    assert list(MacrobendLossResult.model_fields) == [
        "input_power_dbm",
        "total_bend_loss_db",
        "output_power_dbm",
        "bends",
        "model_manifest",
    ]
    assert result.input_power_dbm == -3.0
    assert result.total_bend_loss_db == 1.5
    assert result.output_power_dbm == -4.5
    assert result.bends == (make_point(),)
    assert result.model_manifest == MacrobendLossManifest()


@pytest.mark.parametrize(
    "model",
    [make_bend(), make_request(), MacrobendLossManifest(), make_point(), make_result()],
)
def test_all_models_are_closed_and_frozen(model: object) -> None:
    values = model.model_dump()  # type: ignore[attr-defined]
    values["unexpected"] = "forbidden"
    with pytest.raises(ValidationError) as exc_info:
        type(model).model_validate(values)  # type: ignore[attr-defined]

    assert exc_info.value.errors()[0]["type"] == "extra_forbidden"

    field_name = next(iter(type(model).model_fields))  # type: ignore[attr-defined]
    with pytest.raises(ValidationError) as exc_info:
        setattr(model, field_name, getattr(model, field_name))

    assert exc_info.value.errors()[0]["type"] == "frozen_instance"


@pytest.mark.parametrize(
    ("model_factory", "field"),
    [
        (make_point, "output_power_dbm"),
        (make_point, "cumulative_bend_loss_db"),
        (make_result, "total_bend_loss_db"),
        (make_result, "output_power_dbm"),
    ],
)
def test_point_and_result_reject_nonfinite_numeric_values(
    model_factory: Callable[[], MacrobendLossPoint | MacrobendLossResult], field: str
) -> None:
    model = model_factory()
    values = model.model_dump()
    values[field] = math.nan

    with pytest.raises(ValidationError) as exc_info:
        type(model).model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "finite_number"


@pytest.mark.parametrize(
    "field",
    [
        "position_fraction",
        "radius_mm",
        "angle_deg",
        "supplied_loss_db",
        "cumulative_bend_loss_db",
        "output_power_dbm",
    ],
)
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_point_rejects_nonfinite_numeric_values(field: str, value: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_point(**{field: value})

    assert exc_info.value.errors()[0]["type"] == "finite_number"


@pytest.mark.parametrize("field", ["input_power_dbm", "total_bend_loss_db", "output_power_dbm"])
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_result_rejects_nonfinite_numeric_values(field: str, value: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(**{field: value})

    assert exc_info.value.errors()[0]["type"] == "finite_number"


def test_point_and_result_coerce_bend_collections_to_immutable_tuples() -> None:
    result = make_result(bends=[make_point()])

    assert isinstance(result.bends, tuple)
    append_method = "append"
    with pytest.raises(AttributeError):
        getattr(result.bends, append_method)(make_point(position_fraction=0.9))


def test_result_serializes_deterministically_and_round_trips_json() -> None:
    request = make_request(
        input_power_dbm=-7.25,
        bends=(
            make_bend(position_fraction=0.1, supplied_loss_db=0.25),
            make_bend(position_fraction=0.9, supplied_loss_db=1.75),
        ),
    )
    first = calculate_macrobend_loss(request)
    second = calculate_macrobend_loss(request)

    assert first == second
    assert first.model_dump() == second.model_dump()
    assert first.model_dump_json() == second.model_dump_json()
    assert MacrobendLossResult.model_validate_json(first.model_dump_json()) == first
    assert json.loads(first.model_dump_json()) == first.model_dump(mode="json")


def test_result_rejects_unknown_fields() -> None:
    values = make_result().model_dump()
    values["unexpected"] = "forbidden"

    with pytest.raises(ValidationError) as exc_info:
        MacrobendLossResult.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "extra_forbidden"


def test_result_rejects_passive_aggregate_power_increase() -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(output_power_dbm=-2.0)

    assert exc_info.value.errors()[0]["type"] == "passive_output_power_exceeds_input"


@pytest.mark.parametrize("positions", [(0.5, 0.5), (0.8, 0.2)])
def test_result_requires_strictly_increasing_positions(
    positions: tuple[float, float],
) -> None:
    first = make_point(
        position_fraction=positions[0],
        supplied_loss_db=0.5,
        cumulative_bend_loss_db=0.5,
        output_power_dbm=-3.5,
    )
    second = make_point(
        position_fraction=positions[1],
        supplied_loss_db=0.5,
        cumulative_bend_loss_db=1.0,
        output_power_dbm=-4.0,
    )

    with pytest.raises(ValidationError) as exc_info:
        make_result(
            total_bend_loss_db=1.0,
            output_power_dbm=-4.0,
            bends=(first, second),
        )

    assert exc_info.value.errors()[0]["type"] == ("result_bend_positions_not_strictly_increasing")


def test_result_rejects_decreasing_cumulative_loss() -> None:
    first = make_point(
        position_fraction=0.2,
        cumulative_bend_loss_db=1.0,
        output_power_dbm=-3.5,
    )
    second = make_point(
        position_fraction=0.8,
        cumulative_bend_loss_db=0.5,
        output_power_dbm=-4.0,
    )

    with pytest.raises(ValidationError) as exc_info:
        make_result(
            total_bend_loss_db=0.5,
            output_power_dbm=-4.0,
            bends=(first, second),
        )

    assert exc_info.value.errors()[0]["type"] == "cumulative_bend_loss_decreases"


def test_result_rejects_increasing_point_power() -> None:
    first = make_point(
        position_fraction=0.2,
        cumulative_bend_loss_db=0.5,
        output_power_dbm=-5.0,
    )
    second = make_point(
        position_fraction=0.8,
        cumulative_bend_loss_db=1.0,
        output_power_dbm=-4.0,
    )

    with pytest.raises(ValidationError) as exc_info:
        make_result(
            total_bend_loss_db=1.0,
            output_power_dbm=-4.0,
            bends=(first, second),
        )

    assert exc_info.value.errors()[0]["type"] == "point_power_increases"


def test_result_rejects_any_point_power_above_input() -> None:
    first = make_point(
        position_fraction=0.2,
        cumulative_bend_loss_db=0.5,
        output_power_dbm=-2.0,
    )
    second = make_point(
        position_fraction=0.8,
        cumulative_bend_loss_db=1.0,
        output_power_dbm=-4.0,
    )

    with pytest.raises(ValidationError) as exc_info:
        make_result(
            total_bend_loss_db=1.0,
            output_power_dbm=-4.0,
            bends=(first, second),
        )

    assert exc_info.value.errors()[0]["type"] == "point_power_exceeds_input"


@pytest.mark.parametrize(
    ("total_bend_loss_db", "output_power_dbm", "error_type"),
    [
        (-0.0, -3.0, "empty_result_total_loss_not_positive_zero"),
        (0.25, -3.0, "empty_result_total_loss_not_positive_zero"),
        (0.0, -4.0, "empty_result_output_power_mismatch"),
    ],
)
def test_empty_result_requires_positive_zero_loss_and_unchanged_power(
    total_bend_loss_db: float,
    output_power_dbm: float,
    error_type: str,
) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(
            total_bend_loss_db=total_bend_loss_db,
            output_power_dbm=output_power_dbm,
            bends=(),
        )

    assert exc_info.value.errors()[0]["type"] == error_type


def test_nonempty_result_requires_last_bend_to_match_aggregate_loss() -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(total_bend_loss_db=1.0)

    assert exc_info.value.errors()[0]["type"] == "last_bend_total_loss_mismatch"


def test_nonempty_result_requires_last_bend_to_match_aggregate_power() -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(output_power_dbm=-5.0)

    assert exc_info.value.errors()[0]["type"] == "last_bend_output_power_mismatch"


def test_result_accepts_maximum_bends_and_rejects_one_more() -> None:
    def point(index: int, count: int) -> MacrobendLossPoint:
        cumulative_loss = float(index + 1)
        return make_point(
            position_fraction=(index + 1) / (count + 1),
            supplied_loss_db=1.0,
            cumulative_bend_loss_db=cumulative_loss,
            output_power_dbm=-3.0 - cumulative_loss,
        )

    bends_at_limit = tuple(point(index, MAX_MACROBENDS) for index in range(MAX_MACROBENDS))
    accepted = make_result(
        total_bend_loss_db=float(MAX_MACROBENDS),
        output_power_dbm=-3.0 - MAX_MACROBENDS,
        bends=bends_at_limit,
    )

    assert len(accepted.bends) == MAX_MACROBENDS

    too_many = tuple(point(index, MAX_MACROBENDS + 1) for index in range(MAX_MACROBENDS + 1))
    with pytest.raises(ValidationError) as exc_info:
        make_result(
            total_bend_loss_db=float(MAX_MACROBENDS + 1),
            output_power_dbm=-3.0 - (MAX_MACROBENDS + 1),
            bends=too_many,
        )

    assert exc_info.value.errors()[0]["type"] == "too_long"


def test_result_schema_names_bends_and_publishes_the_limit() -> None:
    schema = MacrobendLossResult.model_json_schema()

    assert "bends" in schema["properties"]
    assert "points" not in schema["properties"]
    assert schema["properties"]["bends"]["maxItems"] == MAX_MACROBENDS
