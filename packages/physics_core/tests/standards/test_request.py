import json
import math

import pytest
from pydantic import ValidationError

import fibre_sim.standards as standards
import fibre_sim.standards.constants as constants
from fibre_sim.standards import (
    G652DDispersionCheckManifest,
    G652DDispersionCheckRequest,
    G652DDispersionCheckResult,
    G652DDispersionCheckStatus,
    G652DDispersionEnvelopeManifest,
    G652DDispersionEnvelopeRequest,
    G652DDispersionEnvelopeResult,
    G652DDispersionFitRegion,
    calculate_g652d_dispersion_envelope,
)


def test_public_exports_are_exact_and_include_calculation() -> None:
    expected_exports = [
        "G652DDispersionCheckManifest",
        "G652DDispersionCheckRequest",
        "G652DDispersionCheckResult",
        "G652DDispersionCheckStatus",
        "G652DDispersionEnvelopeManifest",
        "G652DDispersionEnvelopeRequest",
        "G652DDispersionEnvelopeResult",
        "G652DDispersionFitRegion",
        "calculate_g652d_dispersion_envelope",
    ]

    assert standards.__all__ == expected_exports
    assert [getattr(standards, name) for name in expected_exports] == [
        G652DDispersionCheckManifest,
        G652DDispersionCheckRequest,
        G652DDispersionCheckResult,
        G652DDispersionCheckStatus,
        G652DDispersionEnvelopeManifest,
        G652DDispersionEnvelopeRequest,
        G652DDispersionEnvelopeResult,
        G652DDispersionFitRegion,
        calculate_g652d_dispersion_envelope,
    ]
    assert [
        name
        for name, value in vars(standards).items()
        if not name.startswith("_") and callable(value) and name not in expected_exports
    ] == []


def test_internal_g652d_constants_are_exact() -> None:
    expected = {
        "G652D_MIN_WAVELENGTH_NM": 1260.0,
        "G652D_TRANSITION_WAVELENGTH_NM": 1460.0,
        "G652D_MAX_WAVELENGTH_NM": 1625.0,
        "G652D_ZERO_DISPERSION_MIN_WAVELENGTH_NM": 1300.0,
        "G652D_ZERO_DISPERSION_MAX_WAVELENGTH_NM": 1324.0,
        "G652D_ZERO_DISPERSION_MIN_SLOPE_PS_PER_NM2_KM": 0.073,
        "G652D_ZERO_DISPERSION_MAX_SLOPE_PS_PER_NM2_KM": 0.092,
        "G652D_LINEAR_MIN_INTERCEPT_PS_PER_NM_KM": 8.625,
        "G652D_LINEAR_MIN_SLOPE_PS_PER_NM2_KM": 0.052,
        "G652D_LINEAR_MAX_INTERCEPT_PS_PER_NM_KM": 12.472,
        "G652D_LINEAR_MAX_SLOPE_PS_PER_NM2_KM": 0.068,
    }

    assert {name: getattr(constants, name) for name in expected} == expected


def test_fit_region_values_string_behavior_and_json_behavior_are_stable() -> None:
    assert [region.name for region in G652DDispersionFitRegion] == [
        "THREE_TERM_SELLMEIER",
        "LINEAR",
    ]
    assert [region.value for region in G652DDispersionFitRegion] == [
        "three_term_sellmeier",
        "linear",
    ]
    assert str(G652DDispersionFitRegion.THREE_TERM_SELLMEIER) == "three_term_sellmeier"
    assert str(G652DDispersionFitRegion.LINEAR) == "linear"
    assert G652DDispersionFitRegion("three_term_sellmeier") is (
        G652DDispersionFitRegion.THREE_TERM_SELLMEIER
    )
    assert json.dumps(G652DDispersionFitRegion.LINEAR) == '"linear"'


def valid_request_values() -> dict[str, object]:
    return {"wavelength_nm": 1550.0}


def test_request_has_exact_required_field_and_accepts_normal_values() -> None:
    request = G652DDispersionEnvelopeRequest.model_validate(valid_request_values())

    assert list(G652DDispersionEnvelopeRequest.model_fields) == ["wavelength_nm"]
    assert all(
        field.is_required() for field in G652DDispersionEnvelopeRequest.model_fields.values()
    )
    assert request.wavelength_nm == 1550.0


def test_request_requires_wavelength() -> None:
    with pytest.raises(ValidationError) as exc_info:
        G652DDispersionEnvelopeRequest.model_validate({})

    assert exc_info.value.errors()[0]["loc"] == ("wavelength_nm",)
    assert exc_info.value.errors()[0]["type"] == "missing"


@pytest.mark.parametrize("wavelength_nm", [1260.0, 1460.0, 1625.0])
def test_request_accepts_inclusive_domain_boundaries(wavelength_nm: float) -> None:
    request = G652DDispersionEnvelopeRequest(wavelength_nm=wavelength_nm)

    assert request.wavelength_nm == wavelength_nm


@pytest.mark.parametrize(
    ("wavelength_nm", "error_type"),
    [
        (math.nextafter(1260.0, -math.inf), "greater_than_equal"),
        (math.nextafter(1625.0, math.inf), "less_than_equal"),
    ],
)
def test_request_rejects_values_outside_inclusive_domain(
    wavelength_nm: float, error_type: str
) -> None:
    with pytest.raises(ValidationError) as exc_info:
        G652DDispersionEnvelopeRequest(wavelength_nm=wavelength_nm)

    assert exc_info.value.errors()[0]["type"] == error_type


@pytest.mark.parametrize("wavelength_nm", [math.nan, math.inf, -math.inf])
def test_request_rejects_nonfinite_wavelength(wavelength_nm: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        G652DDispersionEnvelopeRequest(wavelength_nm=wavelength_nm)

    assert exc_info.value.errors()[0]["type"] == "finite_number"


def test_request_serializes_deterministically() -> None:
    first = G652DDispersionEnvelopeRequest.model_validate(valid_request_values())
    second = G652DDispersionEnvelopeRequest.model_validate(valid_request_values())

    assert first == second
    assert first.model_dump() == {"wavelength_nm": 1550.0}
    assert first.model_dump() == second.model_dump()
    assert first.model_dump_json() == second.model_dump_json()
    assert first.model_dump_json() == '{"wavelength_nm":1550.0}'


def test_request_rejects_unknown_fields_and_is_frozen() -> None:
    values = valid_request_values()
    values["unexpected"] = "forbidden"

    with pytest.raises(ValidationError) as exc_info:
        G652DDispersionEnvelopeRequest.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "extra_forbidden"

    request = G652DDispersionEnvelopeRequest.model_validate(valid_request_values())
    with pytest.raises(ValidationError) as exc_info:
        request.wavelength_nm = 1260.0

    assert exc_info.value.errors()[0]["type"] == "frozen_instance"


def test_request_json_schema_is_explicit_and_descriptive() -> None:
    schema = G652DDispersionEnvelopeRequest.model_json_schema()

    assert list(schema["properties"]) == ["wavelength_nm"]
    assert schema["required"] == ["wavelength_nm"]
    assert schema["additionalProperties"] is False

    wavelength_schema = schema["properties"]["wavelength_nm"]
    assert wavelength_schema["type"] == "number"
    assert wavelength_schema["minimum"] == 1260.0
    assert wavelength_schema["maximum"] == 1625.0
    assert "allow_inf_nan" not in wavelength_schema
    assert "wavelength" in wavelength_schema["description"].lower()
    assert "nm" in wavelength_schema["description"].lower()
