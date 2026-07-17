import math

import pytest
from pydantic import ValidationError

import fibre_sim.attenuation as attenuation
from fibre_sim.attenuation import (
    ConstantAttenuationCalculationError,
    ConstantAttenuationManifest,
    ConstantAttenuationRequest,
    ConstantAttenuationResult,
    calculate_constant_attenuation,
)


def valid_request_values() -> dict[str, object]:
    return {
        "length_km": 12.5,
        "attenuation_db_per_km": 0.2,
        "input_power_dbm": -3.0,
    }


def test_public_exports_and_all_are_exact() -> None:
    expected_exports = [
        "ConstantAttenuationCalculationError",
        "ConstantAttenuationManifest",
        "ConstantAttenuationRequest",
        "ConstantAttenuationResult",
        "calculate_constant_attenuation",
    ]

    assert attenuation.__all__ == expected_exports
    assert {
        name
        for name, value in vars(attenuation).items()
        if not name.startswith("_") and callable(value)
    } == set(expected_exports)
    assert [getattr(attenuation, name) for name in expected_exports] == [
        ConstantAttenuationCalculationError,
        ConstantAttenuationManifest,
        ConstantAttenuationRequest,
        ConstantAttenuationResult,
        calculate_constant_attenuation,
    ]


def test_request_has_exact_fields_and_accepts_normal_values() -> None:
    request = ConstantAttenuationRequest.model_validate(valid_request_values())

    assert list(ConstantAttenuationRequest.model_fields) == [
        "length_km",
        "attenuation_db_per_km",
        "input_power_dbm",
    ]
    assert request.length_km == 12.5
    assert request.attenuation_db_per_km == 0.2
    assert request.input_power_dbm == -3.0


@pytest.mark.parametrize(
    ("length_km", "attenuation_db_per_km", "input_power_dbm"),
    [
        (0.0, 0.2, -3.0),
        (12.5, 0.0, -3.0),
        (0.0, 0.0, 0.0),
        (1.0, 0.1, 7.25),
        (1.0, 0.1, -7.25),
    ],
)
def test_request_accepts_range_boundaries_and_signed_input_power(
    length_km: float,
    attenuation_db_per_km: float,
    input_power_dbm: float,
) -> None:
    request = ConstantAttenuationRequest(
        length_km=length_km,
        attenuation_db_per_km=attenuation_db_per_km,
        input_power_dbm=input_power_dbm,
    )

    assert request.length_km == length_km
    assert request.attenuation_db_per_km == attenuation_db_per_km
    assert request.input_power_dbm == input_power_dbm


@pytest.mark.parametrize("field", ["length_km", "attenuation_db_per_km"])
def test_request_rejects_negative_nonnegative_fields(field: str) -> None:
    values = valid_request_values()
    values[field] = -1.0

    with pytest.raises(ValidationError) as exc_info:
        ConstantAttenuationRequest.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "greater_than_equal"


@pytest.mark.parametrize(
    "field",
    ["length_km", "attenuation_db_per_km", "input_power_dbm"],
)
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_request_rejects_non_finite_numeric_values(field: str, value: float) -> None:
    values = valid_request_values()
    values[field] = value

    with pytest.raises(ValidationError) as exc_info:
        ConstantAttenuationRequest.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "finite_number"


def test_request_serializes_deterministically() -> None:
    values = valid_request_values()
    first = ConstantAttenuationRequest.model_validate(values)
    second = ConstantAttenuationRequest.model_validate(values)

    assert first == second
    assert first.model_dump() == values
    assert first.model_dump() == second.model_dump()
    assert first.model_dump_json() == second.model_dump_json()
    assert first.model_dump_json() == (
        '{"length_km":12.5,"attenuation_db_per_km":0.2,"input_power_dbm":-3.0}'
    )


def test_request_rejects_unknown_fields_and_is_frozen() -> None:
    values = valid_request_values()
    values["unexpected"] = "forbidden"

    with pytest.raises(ValidationError) as exc_info:
        ConstantAttenuationRequest.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "extra_forbidden"

    request = ConstantAttenuationRequest.model_validate(valid_request_values())
    with pytest.raises(ValidationError) as exc_info:
        request.length_km = 13.0

    assert exc_info.value.errors()[0]["type"] == "frozen_instance"


def test_request_json_schema_is_explicit_and_unit_descriptive() -> None:
    schema = ConstantAttenuationRequest.model_json_schema()

    assert list(schema["properties"]) == [
        "length_km",
        "attenuation_db_per_km",
        "input_power_dbm",
    ]
    assert schema["required"] == ["length_km", "attenuation_db_per_km", "input_power_dbm"]
    assert schema["additionalProperties"] is False

    length_schema = schema["properties"]["length_km"]
    attenuation_schema = schema["properties"]["attenuation_db_per_km"]
    input_power_schema = schema["properties"]["input_power_dbm"]

    for field_schema in (length_schema, attenuation_schema, input_power_schema):
        assert field_schema["type"] == "number"
        assert "allow_inf_nan" not in field_schema

    assert length_schema["minimum"] == 0
    assert attenuation_schema["minimum"] == 0
    assert "minimum" not in input_power_schema
    assert "km" in length_schema["description"].lower()
    assert "db/km" in attenuation_schema["description"].lower()
    assert "dbm" in input_power_schema["description"].lower()
