import json
import math

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from pydantic import ValidationError

from fibre_sim.guidance import GuidanceRequest, calculate_guidance
from fibre_sim.level1 import (
    Level1BoundaryKind,
    Level1FibrePreset,
    Level1ParameterBoundary,
    Level1ParameterField,
    Level1SimulationRequest,
    Level1StandardsChecks,
    build_level1_parameter_boundaries,
    calculate_level1_simulation,
)
from fibre_sim.standards import G652DAttenuationApplication

from .test_request import fibre_values, request_values, source_values


def make_request(preset: Level1FibrePreset = Level1FibrePreset.CUSTOM) -> Level1SimulationRequest:
    return Level1SimulationRequest.model_validate(request_values(preset))


def boundaries_by_kind_and_field(result: object) -> dict[tuple[str, str], Level1ParameterBoundary]:
    assert hasattr(result, "parameter_boundaries")
    boundaries = result.parameter_boundaries
    return {(boundary.kind.value, boundary.field.value): boundary for boundary in boundaries}


@st.composite
def valid_custom_requests(draw: st.DrawFn) -> Level1SimulationRequest:
    n_cladding = draw(st.floats(min_value=1.4, max_value=1.48, allow_nan=False))
    index_delta = draw(st.floats(min_value=0.001, max_value=0.1, allow_nan=False))
    values = request_values()
    values["fibre"] = {
        **fibre_values(),
        "n_cladding": n_cladding,
        "n_core": n_cladding + index_delta,
        "core_radius_um": draw(st.floats(min_value=0.1, max_value=10.0, allow_nan=False)),
    }
    values["source"] = {
        **source_values(),
        "wavelength_nm": draw(st.floats(min_value=0.1, max_value=2_000.0, allow_nan=False)),
    }
    return Level1SimulationRequest.model_validate(values)


def test_boundary_contracts_are_frozen_extra_forbid_and_exactly_typed() -> None:
    assert [field.value for field in Level1ParameterField] == [
        "n_core",
        "n_cladding",
        "core_radius_um",
        "mode_field_radius_um",
        "attenuation_db_per_km",
        "dispersion_ps_per_nm_km",
        "group_index_dimensionless",
        "wavelength_nm",
        "input_power_dbm",
        "spectral_width_fwhm_nm",
        "input_pulse_fwhm_ps",
        "length_km",
        "grid_half_width_um",
        "grid_points",
    ]
    assert [kind.value for kind in Level1BoundaryKind] == ["input", "model", "standard"]
    assert list(Level1ParameterBoundary.model_fields) == [
        "field",
        "kind",
        "label",
        "range_text",
        "depends_on",
        "source_model_id",
    ]

    boundary = Level1ParameterBoundary(
        field=Level1ParameterField.N_CORE,
        kind=Level1BoundaryKind.INPUT,
        label="Valid input",
        range_text="finite and > current cladding refractive index",
        depends_on=(Level1ParameterField.N_CLADDING,),
        source_model_id="level1_input_validation",
    )
    assert isinstance(boundary.depends_on, tuple)
    with pytest.raises(ValidationError) as exc_info:
        boundary.label = "changed"
    assert exc_info.value.errors()[0]["type"] == "frozen_instance"

    with pytest.raises(ValidationError) as exc_info:
        Level1ParameterBoundary.model_validate({**boundary.model_dump(), "extra": True})
    assert exc_info.value.errors()[0]["type"] == "extra_forbidden"


@pytest.mark.parametrize("field_name", ["label", "range_text", "source_model_id"])
def test_boundary_contract_rejects_empty_text_fields(field_name: str) -> None:
    values = {
        "field": Level1ParameterField.N_CORE,
        "kind": Level1BoundaryKind.INPUT,
        "label": "Valid input",
        "range_text": "finite and > current cladding refractive index",
        "depends_on": (Level1ParameterField.N_CLADDING,),
        "source_model_id": "level1_input_validation",
    }
    values[field_name] = ""

    with pytest.raises(ValidationError) as exc_info:
        Level1ParameterBoundary.model_validate(values)

    assert exc_info.value.errors()[0]["loc"] == (field_name,)
    assert exc_info.value.errors()[0]["type"] == "string_too_short"


def test_custom_boundaries_cover_all_numeric_fields_and_only_input_model_lines() -> None:
    result = calculate_level1_simulation(make_request())
    boundaries = result.parameter_boundaries
    numeric_fields = set(Level1ParameterField)
    input_boundaries = [
        boundary for boundary in boundaries if boundary.kind is Level1BoundaryKind.INPUT
    ]

    assert {boundary.field for boundary in input_boundaries} == numeric_fields
    assert len(input_boundaries) == len(numeric_fields)
    assert {boundary.kind for boundary in boundaries} == {
        Level1BoundaryKind.INPUT,
        Level1BoundaryKind.MODEL,
    }
    assert all(
        boundary.source_model_id == "level1_input_validation" for boundary in input_boundaries
    )
    assert all(boundary.label == "Valid input" for boundary in input_boundaries)
    assert not any(boundary.label == "G.652.D limit" for boundary in boundaries)

    by_key = boundaries_by_kind_and_field(result)
    assert by_key[("input", "n_core")].depends_on == (Level1ParameterField.N_CLADDING,)
    assert by_key[("input", "n_cladding")].depends_on == (Level1ParameterField.N_CORE,)
    assert by_key[("input", "input_power_dbm")].range_text == "finite dBm"
    assert by_key[("input", "grid_points")].range_text == "odd integer from 3 to 65 inclusive"


@settings(max_examples=20, derandomize=True, deadline=None)
@given(request=valid_custom_requests())
def test_valid_custom_requests_always_keep_all_input_boundaries(
    request: Level1SimulationRequest,
) -> None:
    guidance = calculate_guidance(
        GuidanceRequest(
            n_core=request.fibre.n_core,
            n_cladding=request.fibre.n_cladding,
            core_radius_um=request.fibre.core_radius_um,
            wavelength_nm=request.source.wavelength_nm,
        )
    )
    standards_checks = Level1StandardsChecks(
        preset=Level1FibrePreset.CUSTOM,
        preset_definition=None,
        dispersion=None,
        attenuation=None,
    )

    boundaries = build_level1_parameter_boundaries(request, guidance, standards_checks)

    assert {
        boundary.field for boundary in boundaries if boundary.kind is Level1BoundaryKind.INPUT
    } == set(Level1ParameterField)
    assert all(
        "inf" not in boundary.range_text.lower() and "nan" not in boundary.range_text.lower()
        for boundary in boundaries
    )


def test_ideal_single_mode_bounds_use_guidance_na_and_strict_cutoff_endpoints() -> None:
    request = make_request()
    result = calculate_level1_simulation(request)
    by_key = boundaries_by_kind_and_field(result)
    cutoff = result.guidance.model_manifest.mode_regime_cutoff_v_dimensionless
    numerical_aperture = result.guidance.numerical_aperture_dimensionless
    expected_radius_upper = (
        cutoff * request.source.wavelength_nm / (2.0 * math.pi * 1_000.0 * numerical_aperture)
    )
    expected_wavelength_lower = (
        2.0 * math.pi * 1_000.0 * numerical_aperture * request.fibre.core_radius_um / cutoff
    )

    radius_boundary = by_key[("model", "core_radius_um")]
    wavelength_boundary = by_key[("model", "wavelength_nm")]
    assert f"{expected_radius_upper:.6g} µm" in radius_boundary.range_text
    assert f"{expected_wavelength_lower:.6g} nm" in wavelength_boundary.range_text
    assert "strict upper bound" in radius_boundary.range_text
    assert "strict lower bound" in wavelength_boundary.range_text
    assert f"V-number < {cutoff:.6g}" in radius_boundary.range_text
    assert f"V-number < {cutoff:.6g}" in wavelength_boundary.range_text
    assert radius_boundary.depends_on == (
        Level1ParameterField.N_CORE,
        Level1ParameterField.N_CLADDING,
        Level1ParameterField.WAVELENGTH_NM,
    )
    assert wavelength_boundary.depends_on == (
        Level1ParameterField.N_CORE,
        Level1ParameterField.N_CLADDING,
        Level1ParameterField.CORE_RADIUS_UM,
    )
    assert radius_boundary.source_model_id == result.guidance.model_manifest.model_id
    assert wavelength_boundary.source_model_id == result.guidance.model_manifest.model_id


def test_g652d_boundaries_reuse_check_outputs_and_are_inclusive() -> None:
    result = calculate_level1_simulation(make_request(Level1FibrePreset.G652D))
    by_key = boundaries_by_kind_and_field(result)
    checks = result.standards_checks
    assert checks.preset_definition is not None
    assert checks.dispersion is not None
    assert checks.attenuation is not None

    wavelength = by_key[("standard", "wavelength_nm")]
    assert wavelength.range_text == "1260 to 1625 nm inclusive"
    assert wavelength.depends_on == ()
    assert wavelength.source_model_id == checks.preset_definition.model_id

    attenuation = by_key[("standard", "attenuation_db_per_km")]
    assert checks.attenuation.maximum_attenuation_db_per_km is not None
    assert (
        attenuation.range_text
        == f"0 to {checks.attenuation.maximum_attenuation_db_per_km:.6g} dB/km inclusive"
    )
    assert attenuation.depends_on == (Level1ParameterField.WAVELENGTH_NM,)
    assert attenuation.source_model_id == checks.attenuation.model_manifest.model_id

    dispersion = by_key[("standard", "dispersion_ps_per_nm_km")]
    assert dispersion.range_text == (
        f"{checks.dispersion.minimum_dispersion_ps_per_nm_km:.6g} to "
        f"{checks.dispersion.maximum_dispersion_ps_per_nm_km:.6g} "
        "ps/(nm·km) inclusive"
    )
    assert dispersion.depends_on == (Level1ParameterField.WAVELENGTH_NM,)
    assert dispersion.source_model_id == checks.dispersion.model_manifest.envelope_model_id


@pytest.mark.parametrize(
    "application",
    [
        G652DAttenuationApplication.SHORT_JUMPER,
        G652DAttenuationApplication.INDOOR_CABLE,
        G652DAttenuationApplication.DROP_CABLE,
    ],
)
def test_g652d_attenuation_boundary_is_omitted_when_check_is_not_applicable(
    application: G652DAttenuationApplication,
) -> None:
    values = request_values(Level1FibrePreset.G652D)
    values["fibre"] = {**fibre_values(), "cable_application": application}
    result = calculate_level1_simulation(Level1SimulationRequest.model_validate(values))

    standard_fields = {
        boundary.field
        for boundary in result.parameter_boundaries
        if boundary.kind is Level1BoundaryKind.STANDARD
    }
    assert Level1ParameterField.WAVELENGTH_NM in standard_fields
    assert Level1ParameterField.DISPERSION_PS_PER_NM_KM in standard_fields
    assert Level1ParameterField.ATTENUATION_DB_PER_KM not in standard_fields


def test_g652d_attenuation_boundary_is_omitted_below_direct_check_domain() -> None:
    values = request_values(Level1FibrePreset.G652D)
    values["source"] = {**source_values(), "wavelength_nm": 1260.0}
    result = calculate_level1_simulation(Level1SimulationRequest.model_validate(values))

    assert result.standards_checks.attenuation is not None
    assert result.standards_checks.attenuation.maximum_attenuation_db_per_km is None
    assert not any(
        boundary.kind is Level1BoundaryKind.STANDARD
        and boundary.field is Level1ParameterField.ATTENUATION_DB_PER_KM
        for boundary in result.parameter_boundaries
    )


def test_non_finite_optional_cutoff_lines_are_omitted_without_losing_input_lines() -> None:
    request = make_request()
    result = calculate_level1_simulation(request)
    extreme_guidance = result.guidance.model_copy(
        update={"numerical_aperture_dimensionless": math.ldexp(1.0, -1074)}
    )

    boundaries = build_level1_parameter_boundaries(
        request=request,
        guidance=extreme_guidance,
        standards_checks=result.standards_checks,
    )

    assert {
        boundary.field for boundary in boundaries if boundary.kind is Level1BoundaryKind.INPUT
    } == set(Level1ParameterField)
    assert not any(
        boundary.kind is Level1BoundaryKind.MODEL
        and boundary.field is Level1ParameterField.CORE_RADIUS_UM
        for boundary in boundaries
    )
    assert all(
        "inf" not in boundary.range_text.lower() and "nan" not in boundary.range_text.lower()
        for boundary in boundaries
    )


def test_boundaries_do_not_mutate_request_and_serialize_deterministically() -> None:
    request = make_request()
    before = request.model_dump()
    first = calculate_level1_simulation(request)
    second = calculate_level1_simulation(request)

    assert request.model_dump() == before
    assert first == second
    assert first.model_dump_json() == second.model_dump_json()
    assert json.loads(first.model_dump_json()) == first.model_dump(mode="json")
    assert all(isinstance(boundary.depends_on, tuple) for boundary in first.parameter_boundaries)
