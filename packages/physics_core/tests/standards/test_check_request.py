import math

import pytest
from pydantic import ValidationError

from fibre_sim.standards import G652DDispersionCheckRequest


def valid_request_values() -> dict[str, object]:
    return {
        "wavelength_nm": 1550.0,
        "supplied_dispersion_ps_per_nm_km": 17.0,
    }


def make_request(**overrides: object) -> G652DDispersionCheckRequest:
    values = valid_request_values()
    values.update(overrides)
    return G652DDispersionCheckRequest.model_validate(values)


def test_request_has_exact_required_fields_and_accepts_normal_values() -> None:
    request = make_request()

    assert list(G652DDispersionCheckRequest.model_fields) == [
        "wavelength_nm",
        "supplied_dispersion_ps_per_nm_km",
    ]
    assert all(field.is_required() for field in G652DDispersionCheckRequest.model_fields.values())
    assert request.wavelength_nm == 1550.0
    assert request.supplied_dispersion_ps_per_nm_km == 17.0


def test_request_requires_all_fields_and_reports_locations() -> None:
    with pytest.raises(ValidationError) as exc_info:
        G652DDispersionCheckRequest.model_validate({})

    errors = exc_info.value.errors()
    assert [error["loc"] for error in errors] == [
        ("wavelength_nm",),
        ("supplied_dispersion_ps_per_nm_km",),
    ]
    assert [error["type"] for error in errors] == ["missing", "missing"]


@pytest.mark.parametrize("wavelength_nm", [1260.0, 1625.0])
def test_request_accepts_inclusive_wavelength_boundaries(wavelength_nm: float) -> None:
    request = make_request(wavelength_nm=wavelength_nm)

    assert request.wavelength_nm == wavelength_nm


@pytest.mark.parametrize(
    ("wavelength_nm", "error_type"),
    [
        (math.nextafter(1260.0, -math.inf), "greater_than_equal"),
        (math.nextafter(1625.0, math.inf), "less_than_equal"),
    ],
)
def test_request_rejects_wavelength_outside_inclusive_domain(
    wavelength_nm: float, error_type: str
) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_request(wavelength_nm=wavelength_nm)

    error = exc_info.value.errors()[0]
    assert error["loc"] == ("wavelength_nm",)
    assert error["type"] == error_type


@pytest.mark.parametrize("field", ["wavelength_nm", "supplied_dispersion_ps_per_nm_km"])
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_request_rejects_nonfinite_numeric_values(field: str, value: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_request(**{field: value})

    error = exc_info.value.errors()[0]
    assert error["loc"] == (field,)
    assert error["type"] == "finite_number"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("wavelength_nm", True),
        ("wavelength_nm", False),
        ("wavelength_nm", "1550.0"),
    ],
)
def test_request_rejects_non_strict_wavelengths(field: str, value: object) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_request(**{field: value})

    error = exc_info.value.errors()[0]
    assert error["loc"] == (field,)
    assert error["type"] == "float_type"


@pytest.mark.parametrize("value", [True, False, "17.0"])
def test_request_rejects_non_strict_supplied_dispersion(value: object) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_request(supplied_dispersion_ps_per_nm_km=value)

    error = exc_info.value.errors()[0]
    assert error["loc"] == ("supplied_dispersion_ps_per_nm_km",)
    assert error["type"] == "float_type"


@pytest.mark.parametrize("value", [-999.0, -0.0, 0.0, 999.0])
def test_request_accepts_signed_finite_supplied_dispersion(value: float) -> None:
    request = make_request(supplied_dispersion_ps_per_nm_km=value)

    assert request.supplied_dispersion_ps_per_nm_km == value


def test_request_serializes_deterministically() -> None:
    first = make_request()
    second = make_request()

    assert first == second
    assert first.model_dump() == valid_request_values()
    assert first.model_dump() == second.model_dump()
    assert first.model_dump_json() == second.model_dump_json()
    assert first.model_dump_json() == (
        '{"wavelength_nm":1550.0,"supplied_dispersion_ps_per_nm_km":17.0}'
    )


def test_request_rejects_unknown_fields_and_is_frozen() -> None:
    values = valid_request_values()
    values["unexpected"] = "forbidden"

    with pytest.raises(ValidationError) as exc_info:
        G652DDispersionCheckRequest.model_validate(values)

    error = exc_info.value.errors()[0]
    assert error["loc"] == ("unexpected",)
    assert error["type"] == "extra_forbidden"

    request = make_request()
    for field in ("wavelength_nm", "supplied_dispersion_ps_per_nm_km"):
        with pytest.raises(ValidationError) as exc_info:
            setattr(request, field, getattr(request, field))

        error = exc_info.value.errors()[0]
        assert error["loc"] == (field,)
        assert error["type"] == "frozen_instance"


def test_request_json_schema_is_explicit_and_descriptive() -> None:
    schema = G652DDispersionCheckRequest.model_json_schema()

    assert list(schema["properties"]) == [
        "wavelength_nm",
        "supplied_dispersion_ps_per_nm_km",
    ]
    assert schema["required"] == [
        "wavelength_nm",
        "supplied_dispersion_ps_per_nm_km",
    ]
    assert schema["additionalProperties"] is False

    wavelength_schema = schema["properties"]["wavelength_nm"]
    supplied_schema = schema["properties"]["supplied_dispersion_ps_per_nm_km"]

    for field_schema in (wavelength_schema, supplied_schema):
        assert field_schema["type"] == "number"
        assert "allow_inf_nan" not in field_schema

    assert wavelength_schema["minimum"] == 1260.0
    assert wavelength_schema["maximum"] == 1625.0
    assert "wavelength" in wavelength_schema["description"].lower()
    assert "nm" in wavelength_schema["description"].lower()
    assert "dispersion" in supplied_schema["description"].lower()
    assert all(unit in supplied_schema["description"].lower() for unit in ("ps", "nm", "km"))
