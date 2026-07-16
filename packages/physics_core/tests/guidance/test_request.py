import math

import pytest
from pydantic import ValidationError

from fibre_sim.guidance import GuidanceRequest


def valid_request() -> dict[str, float]:
    return {
        "n_core": 1.5,
        "n_cladding": 1.45,
        "core_radius_um": 4.1,
        "wavelength_nm": 1550.0,
    }


def test_valid_request_serializes() -> None:
    request = GuidanceRequest(**valid_request())

    assert request.model_dump() == valid_request()
    assert request.model_dump_json() == (
        '{"n_core":1.5,"n_cladding":1.45,"core_radius_um":4.1,"wavelength_nm":1550.0}'
    )


def test_requests_with_equal_values_are_equal() -> None:
    values = valid_request()

    assert GuidanceRequest(**values) == GuidanceRequest(**values)


def test_field_assignment_is_rejected() -> None:
    request = GuidanceRequest(**valid_request())

    with pytest.raises(ValidationError) as exc_info:
        request.n_core = 1.6

    assert exc_info.value.errors()[0]["type"] == "frozen_instance"


def test_reversed_refractive_index_order_is_rejected() -> None:
    values = valid_request()
    values["n_core"], values["n_cladding"] = values["n_cladding"], values["n_core"]

    with pytest.raises(ValidationError):
        GuidanceRequest(**values)


@pytest.mark.parametrize("field", ["core_radius_um", "wavelength_nm"])
@pytest.mark.parametrize("value", [0.0, -1.0])
def test_radius_and_wavelength_must_be_strictly_positive(field: str, value: float) -> None:
    values = valid_request()
    values[field] = value

    with pytest.raises(ValidationError) as exc_info:
        GuidanceRequest(**values)

    assert exc_info.value.errors()[0]["type"] == "greater_than"


@pytest.mark.parametrize("field", ["n_core", "n_cladding"])
@pytest.mark.parametrize("value", [0.0, -1.0])
def test_refractive_indices_must_be_positive(field: str, value: float) -> None:
    values = valid_request()
    values[field] = value

    with pytest.raises(ValidationError) as exc_info:
        GuidanceRequest(**values)

    assert exc_info.value.errors()[0]["type"] == "greater_than"


@pytest.mark.parametrize("field", ["n_core", "n_cladding", "core_radius_um", "wavelength_nm"])
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_fields_must_be_finite(field: str, value: float) -> None:
    values = valid_request()
    values[field] = value

    with pytest.raises(ValidationError):
        GuidanceRequest(**values)


def test_unknown_fields_are_rejected() -> None:
    values = valid_request()
    values["unknown"] = 1.0

    with pytest.raises(ValidationError) as exc_info:
        GuidanceRequest(**values)

    assert exc_info.value.errors()[0]["type"] == "extra_forbidden"


def test_refractive_index_order_error_is_stable() -> None:
    values = valid_request()
    values["n_core"] = values["n_cladding"]

    with pytest.raises(ValidationError) as exc_info:
        GuidanceRequest(**values)

    error = exc_info.value.errors()[0]
    assert error["type"] == "invalid_refractive_index_order"
    assert error["msg"] == "Core refractive index must be greater than cladding refractive index."


def test_json_schema_contains_request_constraints() -> None:
    schema = GuidanceRequest.model_json_schema()

    assert set(schema["properties"]) == {
        "n_core",
        "n_cladding",
        "core_radius_um",
        "wavelength_nm",
    }
    assert schema["required"] == ["n_core", "n_cladding", "core_radius_um", "wavelength_nm"]
    assert schema["additionalProperties"] is False
    for field in schema["properties"].values():
        assert field["type"] == "number"
        assert field["exclusiveMinimum"] == 0
