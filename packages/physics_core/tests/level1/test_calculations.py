import json

from fibre_sim.attenuation import ConstantAttenuationRequest, calculate_constant_attenuation
from fibre_sim.dispersion import (
    ChromaticPulseBroadeningRequest,
    GroupDelayRequest,
    calculate_chromatic_pulse_broadening,
    calculate_group_delay,
)
from fibre_sim.guidance import GuidanceRequest, calculate_guidance
from fibre_sim.level1 import (
    Level1FibrePreset,
    Level1SimulationRequest,
    Level1WarningCode,
    calculate_level1_simulation,
)
from fibre_sim.modes import GaussianModeProfileRequest, calculate_gaussian_mode_profile
from fibre_sim.standards import (
    G652DAttenuationApplication,
    G652DAttenuationCheckStatus,
    G652DDispersionCheckStatus,
)

from .test_request import fibre_values, request_values, source_values


def make_request(preset: Level1FibrePreset = Level1FibrePreset.CUSTOM) -> Level1SimulationRequest:
    return Level1SimulationRequest.model_validate(request_values(preset))


def test_custom_path_reuses_existing_subcalculations_and_manifest_order() -> None:
    request = make_request()
    result = calculate_level1_simulation(request)

    assert result.configuration == request
    assert result.guidance == calculate_guidance(
        GuidanceRequest(
            n_core=request.fibre.n_core,
            n_cladding=request.fibre.n_cladding,
            core_radius_um=request.fibre.core_radius_um,
            wavelength_nm=request.source.wavelength_nm,
        )
    )
    assert result.mode_profile == calculate_gaussian_mode_profile(
        GaussianModeProfileRequest(
            mode_field_radius_um=request.fibre.mode_field_radius_um,
            grid_half_width_um=request.sampling.grid_half_width_um,
            grid_points=request.sampling.grid_points,
        )
    )
    assert result.attenuation == calculate_constant_attenuation(
        ConstantAttenuationRequest(
            length_km=request.section.length_km,
            attenuation_db_per_km=request.fibre.attenuation_db_per_km,
            input_power_dbm=request.source.input_power_dbm,
        )
    )
    assert result.group_delay == calculate_group_delay(
        GroupDelayRequest(
            length_km=request.section.length_km,
            group_index_dimensionless=request.fibre.group_index_dimensionless,
        )
    )
    assert result.pulse_broadening == calculate_chromatic_pulse_broadening(
        ChromaticPulseBroadeningRequest(
            length_km=request.section.length_km,
            dispersion_ps_per_nm_km=request.fibre.dispersion_ps_per_nm_km,
            spectral_width_fwhm_nm=request.source.spectral_width_fwhm_nm,
            input_pulse_fwhm_ps=request.source.input_pulse_fwhm_ps,
        )
    )
    assert result.standards_checks.preset is Level1FibrePreset.CUSTOM
    assert result.standards_checks.preset_definition is None
    assert result.model_manifest.component_model_ids == (
        "ideal_circular_step_index_guidance",
        "gaussian_lp01_mode_profile",
        "constant_fibre_attenuation",
        "constant_group_index_delay",
        "first_order_chromatic_pulse_broadening",
    )


def test_g652d_path_runs_standards_and_records_component_order() -> None:
    result = calculate_level1_simulation(make_request(Level1FibrePreset.G652D))
    checks = result.standards_checks

    assert checks.preset is Level1FibrePreset.G652D
    assert checks.preset_definition is not None
    assert checks.dispersion is not None
    assert checks.attenuation is not None
    assert checks.dispersion.status is G652DDispersionCheckStatus.PASS
    assert checks.attenuation.status is G652DAttenuationCheckStatus.PASS
    assert result.attenuation.section_loss_db == 2.5
    assert result.attenuation.output_power_dbm == -5.5
    assert result.model_manifest.component_model_ids[:5] == (
        "ideal_circular_step_index_guidance",
        "gaussian_lp01_mode_profile",
        "constant_fibre_attenuation",
        "constant_group_index_delay",
        "first_order_chromatic_pulse_broadening",
    )
    assert result.model_manifest.component_model_ids[5:] == (
        checks.preset_definition.model_id,
        checks.dispersion.model_manifest.envelope_model_id,
        checks.dispersion.model_manifest.model_id,
        checks.attenuation.model_manifest.model_id,
    )


def test_g652d_attenuation_not_applicable_warning_follows_guidance_warnings() -> None:
    values = request_values(Level1FibrePreset.G652D)
    values["source"] = {**source_values(), "wavelength_nm": 1260.0}
    result = calculate_level1_simulation(Level1SimulationRequest.model_validate(values))
    attenuation = result.standards_checks.attenuation

    assert attenuation is not None
    assert attenuation.status is G652DAttenuationCheckStatus.NOT_APPLICABLE
    assert result.warnings[-1].code is Level1WarningCode.G652D_ATTENUATION_NOT_APPLICABLE
    assert result.warnings[-1].message == attenuation.not_applicable_reason
    assert result.warnings[-1].output_field == "standards_checks.attenuation"
    assert [warning.output_field for warning in result.warnings[:-1]] == [
        warning.output_field for warning in result.guidance.warnings
    ]


def test_nonstandard_application_produces_not_applicable_warning() -> None:
    values = request_values(Level1FibrePreset.G652D)
    values["fibre"] = {
        **fibre_values(),
        "cable_application": G652DAttenuationApplication.SHORT_JUMPER,
    }
    result = calculate_level1_simulation(Level1SimulationRequest.model_validate(values))
    attenuation = result.standards_checks.attenuation

    assert attenuation is not None
    assert attenuation.status is G652DAttenuationCheckStatus.NOT_APPLICABLE
    assert result.warnings[-1].code is Level1WarningCode.G652D_ATTENUATION_NOT_APPLICABLE
    assert result.warnings[-1].message == attenuation.not_applicable_reason


def test_repeated_level1_calculation_is_frozen_and_json_deterministic() -> None:
    request = make_request()
    first = calculate_level1_simulation(request)
    second = calculate_level1_simulation(request)

    assert first == second
    assert first.model_dump_json() == second.model_dump_json()
    assert json.loads(first.model_dump_json()) == first.model_dump(mode="json")
