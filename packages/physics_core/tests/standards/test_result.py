import json
import math

import pytest
from pydantic import ValidationError

from fibre_sim.standards import (
    G652DDispersionEnvelopeManifest,
    G652DDispersionEnvelopeRequest,
    G652DDispersionEnvelopeResult,
    G652DDispersionFitRegion,
)

ASSUMPTIONS = (
    "normative chromatic-dispersion coefficient boundaries for G.652.D fibre attributes",
    "1260-1460 nm uses the published three-term Sellmeier boundary form",
    "1460-1625 nm uses the published linear boundary form",
    "the linear region owns the shared 1460 nm boundary for deterministic evaluation",
)
LIMITATIONS = (
    "envelope bounds are not a nominal or measured product dispersion curve",
    "dispersion-envelope evaluation alone is not complete G.652.D conformance",
    "excludes longitudinal variation, statistical link design, and multi-section accumulation",
    "does not calculate pulse broadening or group delay",
)
NUMERIC_MANIFEST_DEFAULTS = {
    "wavelength_min_nm": 1260.0,
    "wavelength_transition_nm": 1460.0,
    "wavelength_max_nm": 1625.0,
    "zero_dispersion_wavelength_min_nm": 1300.0,
    "zero_dispersion_wavelength_max_nm": 1324.0,
    "zero_dispersion_slope_min_ps_per_nm2_km": 0.073,
    "zero_dispersion_slope_max_ps_per_nm2_km": 0.092,
    "linear_minimum_intercept_ps_per_nm_km": 8.625,
    "linear_minimum_slope_ps_per_nm2_km": 0.052,
    "linear_maximum_intercept_ps_per_nm_km": 12.472,
    "linear_maximum_slope_ps_per_nm2_km": 0.068,
}
BOUNDARY_EQUATIONS = ("6-2a", "6-2b", "6-2c", "6-3")


def valid_result_values() -> dict[str, object]:
    return {
        "wavelength_nm": 1550.0,
        "fit_region": G652DDispersionFitRegion.LINEAR,
        "minimum_dispersion_ps_per_nm_km": 13.305,
        "maximum_dispersion_ps_per_nm_km": 18.592,
        "model_manifest": G652DDispersionEnvelopeManifest(),
    }


def make_result(**overrides: object) -> G652DDispersionEnvelopeResult:
    values = valid_result_values()
    values.update(overrides)
    return G652DDispersionEnvelopeResult.model_validate(values)


def test_manifest_has_exact_fields_values_and_immutable_tuples() -> None:
    manifest = G652DDispersionEnvelopeManifest()

    assert list(G652DDispersionEnvelopeManifest.model_fields) == [
        "model_id",
        "model_version",
        "standard_name",
        "standard_edition",
        "fibre_category",
        "boundary_equations",
        *NUMERIC_MANIFEST_DEFAULTS,
        "assumptions",
        "limitations",
    ]
    assert manifest.model_id == "itu_t_g652d_chromatic_dispersion_envelope"
    assert manifest.model_version == "1.0.0"
    assert manifest.standard_name == "ITU-T G.652"
    assert manifest.standard_edition == "08/2024"
    assert manifest.fibre_category == "G.652.D"
    assert manifest.boundary_equations == BOUNDARY_EQUATIONS
    assert manifest.assumptions == ASSUMPTIONS
    assert manifest.limitations == LIMITATIONS
    assert isinstance(manifest.boundary_equations, tuple)
    assert isinstance(manifest.assumptions, tuple)
    assert isinstance(manifest.limitations, tuple)
    for field, expected in NUMERIC_MANIFEST_DEFAULTS.items():
        actual = getattr(manifest, field)
        assert actual == expected
        assert math.isfinite(actual)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("model_id", "other_model"),
        ("model_version", "2.0.0"),
        ("standard_name", "ITU-T G.652 (other edition)"),
        ("standard_edition", "01/2025"),
        ("fibre_category", "G.652.B"),
    ],
)
def test_manifest_rejects_alternative_literal_values(field: str, value: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        G652DDispersionEnvelopeManifest.model_validate({field: value})

    assert exc_info.value.errors()[0]["type"] == "literal_error"


def test_manifest_coerces_collections_to_immutable_tuples() -> None:
    manifest = G652DDispersionEnvelopeManifest.model_validate(
        {"boundary_equations": list(BOUNDARY_EQUATIONS), "assumptions": list(ASSUMPTIONS)}
    )

    assert manifest.boundary_equations == BOUNDARY_EQUATIONS
    assert manifest.assumptions == ASSUMPTIONS
    assert isinstance(manifest.boundary_equations, tuple)
    assert isinstance(manifest.assumptions, tuple)
    append_method = "append"
    with pytest.raises(AttributeError):
        getattr(manifest.assumptions, append_method)("unexpected")


@pytest.mark.parametrize("field", list(NUMERIC_MANIFEST_DEFAULTS))
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_manifest_rejects_nonfinite_numeric_defaults(field: str, value: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        G652DDispersionEnvelopeManifest.model_validate({field: value})

    assert exc_info.value.errors()[0]["type"] == "finite_number"


def test_manifest_serializes_deterministically_with_json_arrays() -> None:
    first = G652DDispersionEnvelopeManifest()
    second = G652DDispersionEnvelopeManifest()

    assert first == second
    assert first.model_dump() == second.model_dump()
    assert first.model_dump_json() == second.model_dump_json()
    payload = first.model_dump(mode="json")
    assert payload["boundary_equations"] == list(BOUNDARY_EQUATIONS)
    assert payload["assumptions"] == list(ASSUMPTIONS)
    assert payload["limitations"] == list(LIMITATIONS)
    assert json.loads(first.model_dump_json()) == payload


def test_manifest_json_schema_has_exact_defaults_literals_and_constraints() -> None:
    schema = G652DDispersionEnvelopeManifest.model_json_schema()

    assert schema["additionalProperties"] is False
    assert list(schema["properties"]) == [
        "model_id",
        "model_version",
        "standard_name",
        "standard_edition",
        "fibre_category",
        "boundary_equations",
        *NUMERIC_MANIFEST_DEFAULTS,
        "assumptions",
        "limitations",
    ]
    assert "required" not in schema

    literal_defaults = {
        "model_id": "itu_t_g652d_chromatic_dispersion_envelope",
        "model_version": "1.0.0",
        "standard_name": "ITU-T G.652",
        "standard_edition": "08/2024",
        "fibre_category": "G.652.D",
    }
    for field, literal_default in literal_defaults.items():
        field_schema = schema["properties"][field]
        assert field_schema["const"] == literal_default
        assert field_schema["default"] == literal_default

    boundary_schema = schema["properties"]["boundary_equations"]
    assert boundary_schema["type"] == "array"
    assert boundary_schema["default"] == list(BOUNDARY_EQUATIONS)

    for field, numeric_default in NUMERIC_MANIFEST_DEFAULTS.items():
        field_schema = schema["properties"][field]
        assert field_schema["type"] == "number"
        assert field_schema["default"] == numeric_default
        assert "allow_inf_nan" not in field_schema

    for field, tuple_default in (("assumptions", ASSUMPTIONS), ("limitations", LIMITATIONS)):
        field_schema = schema["properties"][field]
        assert field_schema["type"] == "array"
        assert field_schema["items"] == {"type": "string"}
        assert field_schema["default"] == list(tuple_default)


def test_all_models_reject_extras_and_are_frozen() -> None:
    models = (
        G652DDispersionEnvelopeRequest(wavelength_nm=1550.0),
        G652DDispersionEnvelopeManifest(),
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


def test_result_has_exact_required_fields_and_accepts_normal_values() -> None:
    result = make_result()

    assert list(G652DDispersionEnvelopeResult.model_fields) == [
        "wavelength_nm",
        "fit_region",
        "minimum_dispersion_ps_per_nm_km",
        "maximum_dispersion_ps_per_nm_km",
        "model_manifest",
    ]
    assert all(field.is_required() for field in G652DDispersionEnvelopeResult.model_fields.values())
    assert result.wavelength_nm == 1550.0
    assert result.fit_region is G652DDispersionFitRegion.LINEAR
    assert result.minimum_dispersion_ps_per_nm_km == 13.305
    assert result.maximum_dispersion_ps_per_nm_km == 18.592
    assert result.model_manifest == G652DDispersionEnvelopeManifest()


def test_result_requires_all_fields() -> None:
    with pytest.raises(ValidationError) as exc_info:
        G652DDispersionEnvelopeResult.model_validate({})

    assert {error["loc"][0] for error in exc_info.value.errors()} == {
        "wavelength_nm",
        "fit_region",
        "minimum_dispersion_ps_per_nm_km",
        "maximum_dispersion_ps_per_nm_km",
        "model_manifest",
    }


@pytest.mark.parametrize("wavelength_nm", [1260.0, 1625.0])
def test_result_accepts_inclusive_wavelength_boundaries(wavelength_nm: float) -> None:
    result = make_result(wavelength_nm=wavelength_nm)

    assert result.wavelength_nm == wavelength_nm


@pytest.mark.parametrize(
    ("wavelength_nm", "error_type"),
    [
        (math.nextafter(1260.0, -math.inf), "greater_than_equal"),
        (math.nextafter(1625.0, math.inf), "less_than_equal"),
    ],
)
def test_result_rejects_wavelength_outside_inclusive_domain(
    wavelength_nm: float, error_type: str
) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(wavelength_nm=wavelength_nm)

    assert exc_info.value.errors()[0]["type"] == error_type


@pytest.mark.parametrize(
    ("minimum", "maximum"),
    [
        (0.0, 0.0),
        (-0.0, 0.0),
        (-12.5, -2.5),
        (-12.5, 2.5),
        (2.5, 12.5),
    ],
)
def test_result_accepts_signed_finite_bounds_including_equality(
    minimum: float, maximum: float
) -> None:
    result = make_result(
        minimum_dispersion_ps_per_nm_km=minimum,
        maximum_dispersion_ps_per_nm_km=maximum,
    )

    assert result.minimum_dispersion_ps_per_nm_km == minimum
    assert result.maximum_dispersion_ps_per_nm_km == maximum


@pytest.mark.parametrize(
    "field",
    [
        "wavelength_nm",
        "minimum_dispersion_ps_per_nm_km",
        "maximum_dispersion_ps_per_nm_km",
    ],
)
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_result_rejects_nonfinite_numeric_values(field: str, value: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(**{field: value})

    assert exc_info.value.errors()[0]["type"] == "finite_number"


def test_result_rejects_reversed_bounds_with_exact_error() -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(
            minimum_dispersion_ps_per_nm_km=2.0,
            maximum_dispersion_ps_per_nm_km=1.0,
        )

    errors = exc_info.value.errors()
    assert len(errors) == 1
    assert errors[0]["type"] == "dispersion_envelope_bounds_reversed"
    assert errors[0]["msg"] == "G.652.D minimum dispersion cannot exceed maximum dispersion."


def test_result_serializes_deterministically_with_enum_and_nested_manifest() -> None:
    first = make_result()
    second = make_result()

    assert first == second
    assert first.model_dump() == second.model_dump()
    assert first.model_dump(mode="json") == second.model_dump(mode="json")
    assert first.model_dump_json() == second.model_dump_json()
    payload = first.model_dump(mode="json")
    assert payload["fit_region"] == "linear"
    assert payload["model_manifest"]["boundary_equations"] == list(BOUNDARY_EQUATIONS)
    assert json.loads(first.model_dump_json()) == payload


def test_result_json_schema_is_explicit_and_references_manifest_and_region() -> None:
    schema = G652DDispersionEnvelopeResult.model_json_schema()

    assert list(schema["properties"]) == [
        "wavelength_nm",
        "fit_region",
        "minimum_dispersion_ps_per_nm_km",
        "maximum_dispersion_ps_per_nm_km",
        "model_manifest",
    ]
    assert schema["required"] == [
        "wavelength_nm",
        "fit_region",
        "minimum_dispersion_ps_per_nm_km",
        "maximum_dispersion_ps_per_nm_km",
        "model_manifest",
    ]
    assert schema["additionalProperties"] is False

    wavelength_schema = schema["properties"]["wavelength_nm"]
    assert wavelength_schema["type"] == "number"
    assert wavelength_schema["minimum"] == 1260.0
    assert wavelength_schema["maximum"] == 1625.0
    assert "allow_inf_nan" not in wavelength_schema

    fit_region_schema = schema["properties"]["fit_region"]
    assert fit_region_schema["$ref"] == "#/$defs/G652DDispersionFitRegion"
    assert schema["$defs"]["G652DDispersionFitRegion"]["enum"] == [
        "three_term_sellmeier",
        "linear",
    ]

    for field in (
        "minimum_dispersion_ps_per_nm_km",
        "maximum_dispersion_ps_per_nm_km",
    ):
        field_schema = schema["properties"][field]
        assert field_schema["type"] == "number"
        assert "minimum" not in field_schema
        assert "maximum" not in field_schema
        assert "allow_inf_nan" not in field_schema

    assert schema["properties"]["model_manifest"]["$ref"] == (
        "#/$defs/G652DDispersionEnvelopeManifest"
    )


def test_result_has_no_equation_field_or_formula_cross_validation() -> None:
    assert "boundary_equation" not in G652DDispersionEnvelopeResult.model_fields
    assert "equation" not in G652DDispersionEnvelopeResult.model_fields
    result = make_result(
        wavelength_nm=1625.0,
        fit_region=G652DDispersionFitRegion.THREE_TERM_SELLMEIER,
        minimum_dispersion_ps_per_nm_km=-999.0,
        maximum_dispersion_ps_per_nm_km=999.0,
    )

    assert result.wavelength_nm == 1625.0
    assert result.fit_region is G652DDispersionFitRegion.THREE_TERM_SELLMEIER
    assert result.minimum_dispersion_ps_per_nm_km == -999.0
    assert result.maximum_dispersion_ps_per_nm_km == 999.0


def test_result_does_not_cross_validate_bounds_against_region_or_manifest_coefficients() -> None:
    result = make_result(
        wavelength_nm=1260.0,
        fit_region=G652DDispersionFitRegion.LINEAR,
        minimum_dispersion_ps_per_nm_km=-999.0,
        maximum_dispersion_ps_per_nm_km=999.0,
    )

    assert result.fit_region is G652DDispersionFitRegion.LINEAR
    assert result.wavelength_nm == 1260.0
    assert result.minimum_dispersion_ps_per_nm_km == -999.0
    assert result.maximum_dispersion_ps_per_nm_km == 999.0
    assert result.model_manifest.wavelength_min_nm == 1260.0
    assert result.model_manifest.linear_maximum_slope_ps_per_nm2_km == 0.068
