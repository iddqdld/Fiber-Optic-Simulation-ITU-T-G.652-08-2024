import json
import math

import pytest
from pydantic import ValidationError

from fibre_sim.dispersion import (
    VACUUM_SPEED_M_PER_S,
    GroupDelayManifest,
    GroupDelayRequest,
    GroupDelayResult,
)

ASSUMPTIONS = (
    "constant supplied group index over the fibre section",
    "deterministic propagation delay for the supplied section",
    "vacuum speed of light is exact at 299792458 m/s",
)
LIMITATIONS = (
    "group index is supplied rather than derived from wavelength-dependent effective index",
    "excludes chromatic pulse broadening and polarization-mode dispersion",
    "propagation group delay is distinct from differential group delay",
    "not a G.652 group-delay fit or conformance model",
)


def valid_result_values() -> dict[str, object]:
    return {
        "length_km": 12.5,
        "group_index_dimensionless": 1.4682,
        "group_delay_ps": 61_217_350.57124086,
        "model_manifest": GroupDelayManifest(),
    }


def make_result(**overrides: object) -> GroupDelayResult:
    values = valid_result_values()
    values.update(overrides)
    return GroupDelayResult.model_validate(values)


def test_manifest_has_exact_fields_values_and_tuples() -> None:
    manifest = GroupDelayManifest()

    assert list(GroupDelayManifest.model_fields) == [
        "model_id",
        "model_version",
        "vacuum_speed_m_per_s",
        "assumptions",
        "limitations",
    ]
    assert manifest.model_id == "constant_group_index_delay"
    assert manifest.model_version == "1.0.0"
    assert manifest.vacuum_speed_m_per_s == VACUUM_SPEED_M_PER_S
    assert manifest.assumptions == ASSUMPTIONS
    assert manifest.limitations == LIMITATIONS
    assert isinstance(manifest.assumptions, tuple)
    assert isinstance(manifest.limitations, tuple)


@pytest.mark.parametrize(
    ("field", "value"),
    [("model_id", "other_model"), ("model_version", "2.0.0")],
)
def test_manifest_rejects_alternative_literal_values(field: str, value: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        GroupDelayManifest.model_validate({field: value})

    assert exc_info.value.errors()[0]["type"] == "literal_error"


@pytest.mark.parametrize("value", [0.0, -1.0])
def test_manifest_rejects_nonpositive_vacuum_speed(value: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        GroupDelayManifest(vacuum_speed_m_per_s=value)

    assert exc_info.value.errors()[0]["type"] == "greater_than"


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_manifest_rejects_nonfinite_vacuum_speed(value: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        GroupDelayManifest(vacuum_speed_m_per_s=value)

    assert exc_info.value.errors()[0]["type"] == "finite_number"


def test_manifest_coerces_collections_to_immutable_tuples() -> None:
    manifest = GroupDelayManifest.model_validate(
        {"assumptions": ["first", "second"], "limitations": ["only"]}
    )

    assert manifest.assumptions == ("first", "second")
    assert manifest.limitations == ("only",)
    assert isinstance(manifest.assumptions, tuple)
    assert isinstance(manifest.limitations, tuple)
    append_method = "append"
    with pytest.raises(AttributeError):
        getattr(manifest.assumptions, append_method)("unexpected")


def test_manifest_serializes_deterministically_with_json_arrays() -> None:
    first = GroupDelayManifest()
    second = GroupDelayManifest()

    assert first == second
    assert first.model_dump() == second.model_dump()
    assert first.model_dump_json() == second.model_dump_json()
    payload = first.model_dump(mode="json")
    assert isinstance(payload["assumptions"], list)
    assert isinstance(payload["limitations"], list)
    assert json.loads(first.model_dump_json()) == payload


def test_result_has_exact_fields_and_accepts_normal_values() -> None:
    result = make_result()

    assert list(GroupDelayResult.model_fields) == [
        "length_km",
        "group_index_dimensionless",
        "group_delay_ps",
        "model_manifest",
    ]
    assert result.length_km == 12.5
    assert result.group_index_dimensionless == 1.4682
    assert result.group_delay_ps == 61_217_350.57124086
    assert result.model_manifest == GroupDelayManifest()


@pytest.mark.parametrize(
    ("length_km", "group_index_dimensionless", "group_delay_ps"),
    [
        (0.0, 1.4682, 0.0),
        (-0.0, 1.0, -0.0),
        (12.5, 1e-12, 0.0),
    ],
)
def test_result_accepts_zero_and_signed_zero_boundaries(
    length_km: float,
    group_index_dimensionless: float,
    group_delay_ps: float,
) -> None:
    result = make_result(
        length_km=length_km,
        group_index_dimensionless=group_index_dimensionless,
        group_delay_ps=group_delay_ps,
    )

    assert result.length_km == length_km
    assert result.group_index_dimensionless == group_index_dimensionless
    assert result.group_delay_ps == group_delay_ps


@pytest.mark.parametrize("field", ["length_km", "group_delay_ps"])
def test_result_rejects_negative_nonnegative_fields(field: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(**{field: -1.0})

    assert exc_info.value.errors()[0]["type"] == "greater_than_equal"


@pytest.mark.parametrize("value", [0.0, -1.0])
def test_result_rejects_nonpositive_group_index(value: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(group_index_dimensionless=value)

    assert exc_info.value.errors()[0]["type"] == "greater_than"


@pytest.mark.parametrize("field", ["length_km", "group_index_dimensionless", "group_delay_ps"])
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_result_rejects_nonfinite_numeric_values(field: str, value: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(**{field: value})

    assert exc_info.value.errors()[0]["type"] == "finite_number"


def test_all_models_reject_extras_and_are_frozen() -> None:
    models = (
        GroupDelayRequest(length_km=12.5, group_index_dimensionless=1.4682),
        GroupDelayManifest(),
        make_result(),
    )

    for model in models:
        payload = model.model_dump()
        payload["unexpected"] = "forbidden"
        with pytest.raises(ValidationError) as exc_info:
            type(model).model_validate(payload)
        assert exc_info.value.errors()[0]["type"] == "extra_forbidden"

        field_name = next(iter(type(model).model_fields))
        with pytest.raises(ValidationError) as exc_info:
            setattr(model, field_name, model.model_dump()[field_name])
        assert exc_info.value.errors()[0]["type"] == "frozen_instance"


def test_result_serializes_deterministically() -> None:
    first = make_result()
    second = make_result()

    assert first == second
    assert first.model_dump() == second.model_dump()
    assert first.model_dump(mode="json") == second.model_dump(mode="json")
    assert first.model_dump_json() == second.model_dump_json()
    assert json.loads(first.model_dump_json()) == first.model_dump(mode="json")


@pytest.mark.parametrize(
    ("length_km", "group_delay_ps", "expected_formula_delay_ps"),
    [
        (4.0, 0.0, 1.5 * 4.0 * 1000.0 / VACUUM_SPEED_M_PER_S * 1e12),
        (0.0, 10.0, 0.0),
    ],
)
def test_result_does_not_cross_validate_propagation_formula_or_zero_length_delay(
    length_km: float,
    group_delay_ps: float,
    expected_formula_delay_ps: float,
) -> None:
    result = make_result(
        length_km=length_km,
        group_index_dimensionless=1.5,
        group_delay_ps=group_delay_ps,
    )

    assert result.length_km == length_km
    assert result.group_delay_ps == group_delay_ps
    assert result.group_delay_ps != pytest.approx(expected_formula_delay_ps)


def test_manifest_json_schema_has_exact_defaults_literals_and_constraints() -> None:
    schema = GroupDelayManifest.model_json_schema()

    assert schema["additionalProperties"] is False
    assert list(schema["properties"]) == [
        "model_id",
        "model_version",
        "vacuum_speed_m_per_s",
        "assumptions",
        "limitations",
    ]
    assert "required" not in schema

    model_id_schema = schema["properties"]["model_id"]
    assert model_id_schema["const"] == "constant_group_index_delay"
    assert model_id_schema["default"] == "constant_group_index_delay"

    version_schema = schema["properties"]["model_version"]
    assert version_schema["const"] == "1.0.0"
    assert version_schema["default"] == "1.0.0"

    speed_schema = schema["properties"]["vacuum_speed_m_per_s"]
    assert speed_schema["type"] == "number"
    assert speed_schema["default"] == VACUUM_SPEED_M_PER_S
    assert speed_schema["exclusiveMinimum"] == 0
    assert "allow_inf_nan" not in speed_schema

    assumptions_schema = schema["properties"]["assumptions"]
    limitations_schema = schema["properties"]["limitations"]
    assert assumptions_schema["type"] == "array"
    assert assumptions_schema["items"] == {"type": "string"}
    assert assumptions_schema["default"] == list(ASSUMPTIONS)
    assert limitations_schema["type"] == "array"
    assert limitations_schema["items"] == {"type": "string"}
    assert limitations_schema["default"] == list(LIMITATIONS)


def test_result_json_schema_is_explicit_and_references_manifest() -> None:
    schema = GroupDelayResult.model_json_schema()

    assert list(schema["properties"]) == [
        "length_km",
        "group_index_dimensionless",
        "group_delay_ps",
        "model_manifest",
    ]
    assert schema["required"] == [
        "length_km",
        "group_index_dimensionless",
        "group_delay_ps",
        "model_manifest",
    ]
    assert schema["additionalProperties"] is False

    for field in ("length_km", "group_index_dimensionless", "group_delay_ps"):
        assert schema["properties"][field]["type"] == "number"
        assert "allow_inf_nan" not in schema["properties"][field]
    assert schema["properties"]["length_km"]["minimum"] == 0
    assert schema["properties"]["group_index_dimensionless"]["exclusiveMinimum"] == 0
    assert schema["properties"]["group_delay_ps"]["minimum"] == 0
    assert schema["properties"]["model_manifest"]["$ref"] == ("#/$defs/GroupDelayManifest")
