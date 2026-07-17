import math

import pytest
from pydantic import ValidationError

import fibre_sim.dispersion as dispersion
from fibre_sim.dispersion import (
    VACUUM_SPEED_M_PER_S,
    GroupDelayCalculationError,
    GroupDelayManifest,
    GroupDelayRequest,
    GroupDelayResult,
    calculate_group_delay,
)


def valid_request_values() -> dict[str, object]:
    return {
        "length_km": 12.5,
        "group_index_dimensionless": 1.4682,
    }


def test_public_exports_and_constant_are_exact() -> None:
    expected_exports = [
        "GroupDelayCalculationError",
        "GroupDelayManifest",
        "GroupDelayRequest",
        "GroupDelayResult",
        "VACUUM_SPEED_M_PER_S",
        "calculate_group_delay",
    ]

    assert dispersion.__all__ == expected_exports
    assert [getattr(dispersion, name) for name in expected_exports] == [
        GroupDelayCalculationError,
        GroupDelayManifest,
        GroupDelayRequest,
        GroupDelayResult,
        VACUUM_SPEED_M_PER_S,
        calculate_group_delay,
    ]
    assert VACUUM_SPEED_M_PER_S == 299_792_458.0


def test_request_has_exact_required_fields_and_accepts_normal_values() -> None:
    request = GroupDelayRequest.model_validate(valid_request_values())

    assert list(GroupDelayRequest.model_fields) == [
        "length_km",
        "group_index_dimensionless",
    ]
    assert all(field.is_required() for field in GroupDelayRequest.model_fields.values())
    assert request.length_km == 12.5
    assert request.group_index_dimensionless == 1.4682


def test_request_requires_both_fields() -> None:
    with pytest.raises(ValidationError) as exc_info:
        GroupDelayRequest.model_validate({})

    assert {error["loc"][0] for error in exc_info.value.errors()} == {
        "length_km",
        "group_index_dimensionless",
    }


@pytest.mark.parametrize(
    ("length_km", "group_index_dimensionless"),
    [
        (0.0, 1.4682),
        (12.5, 1e-12),
        (-0.0, 1.0),
    ],
)
def test_request_accepts_zero_length_and_positive_group_index_boundaries(
    length_km: float,
    group_index_dimensionless: float,
) -> None:
    request = GroupDelayRequest(
        length_km=length_km,
        group_index_dimensionless=group_index_dimensionless,
    )

    assert request.length_km == length_km
    assert request.group_index_dimensionless == group_index_dimensionless


def test_request_rejects_negative_length() -> None:
    values = valid_request_values()
    values["length_km"] = -1.0

    with pytest.raises(ValidationError) as exc_info:
        GroupDelayRequest.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "greater_than_equal"


@pytest.mark.parametrize("value", [0.0, -1.0])
def test_request_rejects_nonpositive_group_index(value: float) -> None:
    values = valid_request_values()
    values["group_index_dimensionless"] = value

    with pytest.raises(ValidationError) as exc_info:
        GroupDelayRequest.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "greater_than"


@pytest.mark.parametrize("field", ["length_km", "group_index_dimensionless"])
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_request_rejects_nonfinite_numeric_values(field: str, value: float) -> None:
    values = valid_request_values()
    values[field] = value

    with pytest.raises(ValidationError) as exc_info:
        GroupDelayRequest.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "finite_number"


def test_request_serializes_deterministically() -> None:
    values = valid_request_values()
    first = GroupDelayRequest.model_validate(values)
    second = GroupDelayRequest.model_validate(values)

    assert first == second
    assert first.model_dump() == values
    assert first.model_dump() == second.model_dump()
    assert first.model_dump_json() == second.model_dump_json()
    assert first.model_dump_json() == ('{"length_km":12.5,"group_index_dimensionless":1.4682}')


def test_request_rejects_unknown_fields_and_is_frozen() -> None:
    values = valid_request_values()
    values["unexpected"] = "forbidden"

    with pytest.raises(ValidationError) as exc_info:
        GroupDelayRequest.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "extra_forbidden"

    request = GroupDelayRequest.model_validate(valid_request_values())
    with pytest.raises(ValidationError) as exc_info:
        request.length_km = 13.0

    assert exc_info.value.errors()[0]["type"] == "frozen_instance"


def test_request_json_schema_is_explicit_and_descriptive() -> None:
    schema = GroupDelayRequest.model_json_schema()

    assert list(schema["properties"]) == [
        "length_km",
        "group_index_dimensionless",
    ]
    assert schema["required"] == ["length_km", "group_index_dimensionless"]
    assert schema["additionalProperties"] is False

    length_schema = schema["properties"]["length_km"]
    group_index_schema = schema["properties"]["group_index_dimensionless"]

    assert length_schema["type"] == "number"
    assert length_schema["minimum"] == 0
    assert "exclusiveMinimum" not in length_schema
    assert "allow_inf_nan" not in length_schema
    assert "length" in length_schema["description"].lower()
    assert "km" in length_schema["description"].lower()

    assert group_index_schema["type"] == "number"
    assert group_index_schema["exclusiveMinimum"] == 0
    assert "minimum" not in group_index_schema
    assert "allow_inf_nan" not in group_index_schema
    assert "group index" in group_index_schema["description"].lower()
    assert "dimensionless" in group_index_schema["description"].lower()
