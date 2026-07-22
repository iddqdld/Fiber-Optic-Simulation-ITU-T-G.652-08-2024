import json
import math
import sys

import pytest
from pydantic import ValidationError

import fibre_sim.bends as bends
from fibre_sim.bends import MAX_MACROBENDS, MacrobendInput, MacrobendLossRequest


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


def test_public_exports_are_exact() -> None:
    expected_exports = [
        "MAX_MACROBENDS",
        "MacrobendInput",
        "MacrobendLossCalculationError",
        "MacrobendLossManifest",
        "MacrobendLossPoint",
        "MacrobendLossRequest",
        "MacrobendLossResult",
        "calculate_macrobend_loss",
    ]

    assert bends.__all__ == expected_exports
    assert {
        name for name, value in vars(bends).items() if not name.startswith("_") and callable(value)
    } == set(expected_exports) - {"MAX_MACROBENDS"}
    assert [getattr(bends, name) for name in expected_exports] == [
        MAX_MACROBENDS,
        MacrobendInput,
        bends.MacrobendLossCalculationError,
        bends.MacrobendLossManifest,
        bends.MacrobendLossPoint,
        MacrobendLossRequest,
        bends.MacrobendLossResult,
        bends.calculate_macrobend_loss,
    ]


def test_max_macrobends_is_the_public_integer_limit() -> None:
    assert type(MAX_MACROBENDS) is int
    assert MAX_MACROBENDS == 32


def test_input_has_exact_fields_and_accepts_normal_values() -> None:
    bend = make_bend()

    assert list(MacrobendInput.model_fields) == [
        "position_fraction",
        "radius_mm",
        "angle_deg",
        "supplied_loss_db",
    ]
    assert bend.position_fraction == 0.25
    assert bend.radius_mm == 10.0
    assert bend.angle_deg == 90.0
    assert bend.supplied_loss_db == 1.5


@pytest.mark.parametrize(
    ("position_fraction", "radius_mm", "angle_deg", "supplied_loss_db"),
    [
        (0.0, sys.float_info.min, math.nextafter(0.0, math.inf), 0.0),
        (1.0, sys.float_info.max, 360.0, sys.float_info.max),
        (-0.0, 1.0, 360.0, -0.0),
    ],
)
def test_input_accepts_all_inclusive_and_positive_boundaries(
    position_fraction: float,
    radius_mm: float,
    angle_deg: float,
    supplied_loss_db: float,
) -> None:
    bend = make_bend(
        position_fraction=position_fraction,
        radius_mm=radius_mm,
        angle_deg=angle_deg,
        supplied_loss_db=supplied_loss_db,
    )

    assert bend.position_fraction == position_fraction
    assert bend.radius_mm == radius_mm
    assert bend.angle_deg == angle_deg
    assert bend.supplied_loss_db == supplied_loss_db


@pytest.mark.parametrize(
    ("field", "value", "error_type"),
    [
        ("position_fraction", math.nextafter(0.0, -math.inf), "greater_than_equal"),
        ("position_fraction", math.nextafter(1.0, math.inf), "less_than_equal"),
        ("radius_mm", 0.0, "greater_than"),
        ("radius_mm", -math.nextafter(0.0, math.inf), "greater_than"),
        ("radius_mm", -0.0, "greater_than"),
        ("angle_deg", 0.0, "greater_than"),
        ("angle_deg", -math.nextafter(0.0, math.inf), "greater_than"),
        ("angle_deg", -0.0, "greater_than"),
        ("angle_deg", math.nextafter(360.0, math.inf), "less_than_equal"),
        ("supplied_loss_db", -math.nextafter(0.0, math.inf), "greater_than_equal"),
    ],
)
def test_input_rejects_values_outside_its_closed_ranges(
    field: str, value: float, error_type: str
) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_bend(**{field: value})

    error = exc_info.value.errors()[0]
    assert error["loc"] == (field,)
    assert error["type"] == error_type


@pytest.mark.parametrize(
    "field",
    [
        "position_fraction",
        "radius_mm",
        "angle_deg",
        "supplied_loss_db",
    ],
)
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_input_rejects_nonfinite_numeric_values(field: str, value: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_bend(**{field: value})

    error = exc_info.value.errors()[0]
    assert error["loc"] == (field,)
    assert error["type"] == "finite_number"


@pytest.mark.parametrize(
    "field",
    [
        "position_fraction",
        "radius_mm",
        "angle_deg",
        "supplied_loss_db",
    ],
)
@pytest.mark.parametrize("value", [True, False, "1.0", None, [], {}])
def test_input_rejects_non_strict_or_malformed_values(field: str, value: object) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_bend(**{field: value})

    assert exc_info.value.errors()[0]["loc"] == (field,)


def test_request_has_exact_fields_and_default_empty_tuple() -> None:
    request = MacrobendLossRequest(input_power_dbm=-3.0)

    assert list(MacrobendLossRequest.model_fields) == ["input_power_dbm", "bends"]
    assert request.input_power_dbm == -3.0
    assert request.bends == ()
    assert isinstance(request.bends, tuple)


def test_request_coerces_bend_collections_to_immutable_tuples() -> None:
    source = [make_bend(position_fraction=0.1), make_bend(position_fraction=0.9)]
    request = make_request(bends=source)

    assert request.bends == tuple(source)
    assert isinstance(request.bends, tuple)
    append_method = "append"
    with pytest.raises(AttributeError):
        getattr(request.bends, append_method)(make_bend(position_fraction=1.0))

    source.append(make_bend(position_fraction=1.0))
    assert len(request.bends) == 2


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_request_rejects_nonfinite_input_power(value: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_request(input_power_dbm=value)

    error = exc_info.value.errors()[0]
    assert error["loc"] == ("input_power_dbm",)
    assert error["type"] == "finite_number"


@pytest.mark.parametrize("value", [True, False, "-3.0", None, [], {}])
def test_request_input_power_is_strict(value: object) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_request(input_power_dbm=value)

    assert exc_info.value.errors()[0]["loc"] == ("input_power_dbm",)


@pytest.mark.parametrize("value", [-sys.float_info.max, -0.0, 0.0, sys.float_info.max])
def test_request_accepts_finite_signed_input_power_boundaries(value: float) -> None:
    request = make_request(input_power_dbm=value, bends=())

    assert request.input_power_dbm == value


def test_request_accepts_the_maximum_number_of_bends() -> None:
    bends_at_limit = tuple(
        make_bend(position_fraction=(index + 1) / (MAX_MACROBENDS + 1))
        for index in range(MAX_MACROBENDS)
    )

    request = make_request(bends=bends_at_limit)

    assert len(request.bends) == MAX_MACROBENDS
    assert request.bends == bends_at_limit


def test_request_rejects_more_than_the_maximum_number_of_bends() -> None:
    too_many = tuple(
        make_bend(position_fraction=(index + 1) / (MAX_MACROBENDS + 2))
        for index in range(MAX_MACROBENDS + 1)
    )

    with pytest.raises(ValidationError) as exc_info:
        make_request(bends=too_many)

    error = exc_info.value.errors()[0]
    assert error["loc"] == ("bends",)
    assert error["type"] == "too_long"
    assert error["ctx"]["max_length"] == MAX_MACROBENDS


@pytest.mark.parametrize(
    "positions",
    [
        (0.25, 0.25),
        (0.75, 0.25),
        (0.0, 0.0),
        (-0.0, 0.0),
        (1.0, 0.5),
    ],
)
def test_request_requires_strictly_increasing_bend_positions(
    positions: tuple[float, float],
) -> None:
    bends_in_request = tuple(make_bend(position_fraction=position) for position in positions)

    with pytest.raises(ValidationError) as exc_info:
        make_request(bends=bends_in_request)

    error = exc_info.value.errors()[0]
    assert error["loc"] == ()
    assert error["type"] == "bend_positions_not_strictly_increasing"


def test_request_accepts_empty_and_single_position_sequences() -> None:
    empty = make_request(bends=())
    single = make_request(bends=(make_bend(position_fraction=0.0),))

    assert empty.bends == ()
    assert single.bends[0].position_fraction == 0.0


def test_request_serializes_deterministically_and_round_trips_json() -> None:
    first = make_request(
        input_power_dbm=-7.25,
        bends=(
            make_bend(position_fraction=0.1, supplied_loss_db=0.25),
            make_bend(position_fraction=0.9, supplied_loss_db=1.75),
        ),
    )
    second = MacrobendLossRequest.model_validate(first.model_dump())

    assert first == second
    assert first.model_dump() == second.model_dump()
    assert first.model_dump_json() == second.model_dump_json()
    assert MacrobendLossRequest.model_validate_json(first.model_dump_json()) == first
    assert json.loads(first.model_dump_json()) == first.model_dump(mode="json")


def test_request_rejects_unknown_fields_and_is_frozen() -> None:
    values = {
        "input_power_dbm": -3.0,
        "bends": (),
        "unexpected": "forbidden",
    }
    with pytest.raises(ValidationError) as exc_info:
        MacrobendLossRequest.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "extra_forbidden"

    request = make_request()
    with pytest.raises(ValidationError) as exc_info:
        request.input_power_dbm = 0.0

    assert exc_info.value.errors()[0]["type"] == "frozen_instance"


def test_input_and_request_json_schemas_are_explicit() -> None:
    input_schema = MacrobendInput.model_json_schema()
    request_schema = MacrobendLossRequest.model_json_schema()

    assert list(input_schema["properties"]) == [
        "position_fraction",
        "radius_mm",
        "angle_deg",
        "supplied_loss_db",
    ]
    assert input_schema["required"] == [
        "position_fraction",
        "radius_mm",
        "angle_deg",
        "supplied_loss_db",
    ]
    assert input_schema["additionalProperties"] is False
    assert input_schema["properties"]["position_fraction"]["minimum"] == 0
    assert input_schema["properties"]["position_fraction"]["maximum"] == 1
    assert input_schema["properties"]["radius_mm"]["exclusiveMinimum"] == 0
    assert input_schema["properties"]["angle_deg"]["exclusiveMinimum"] == 0
    assert input_schema["properties"]["angle_deg"]["maximum"] == 360
    assert input_schema["properties"]["supplied_loss_db"]["minimum"] == 0

    assert list(request_schema["properties"]) == ["input_power_dbm", "bends"]
    assert request_schema["required"] == ["input_power_dbm"]
    assert request_schema["additionalProperties"] is False
    assert request_schema["properties"]["bends"]["maxItems"] == MAX_MACROBENDS
