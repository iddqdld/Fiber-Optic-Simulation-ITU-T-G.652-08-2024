import json

import pytest
from pydantic import ValidationError

from fibre_sim.attenuation import ConstantAttenuationRequest, calculate_constant_attenuation
from fibre_sim.bends import MacrobendInput, MacrobendLossRequest, calculate_macrobend_loss
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
    Level1SimulationResult,
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


def make_request(
    preset: Level1FibrePreset = Level1FibrePreset.CUSTOM,
    bends: tuple[MacrobendInput, ...] = (),
) -> Level1SimulationRequest:
    values = request_values(preset)
    if bends:
        section = values["section"]
        assert isinstance(section, dict)
        values["section"] = {**section, "bends": bends}
    return Level1SimulationRequest.model_validate(values)


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
        "user_supplied_macrobend_loss",
        "constant_group_index_delay",
        "first_order_chromatic_pulse_broadening",
    )
    assert result.model_manifest.model_version == "1.1.0"
    assert result.bend_loss == calculate_macrobend_loss(
        MacrobendLossRequest(
            input_power_dbm=result.attenuation.output_power_dbm,
        )
    )
    assert result.bend_loss.input_power_dbm == result.attenuation.output_power_dbm
    assert result.bend_loss.output_power_dbm == result.attenuation.output_power_dbm


def test_multiple_bends_start_after_straight_attenuation_and_conserve_power() -> None:
    bends = tuple(
        MacrobendInput.model_validate(
            {
                "position_fraction": position,
                "radius_mm": 12.0,
                "angle_deg": 90.0,
                "supplied_loss_db": loss,
            }
        )
        for position, loss in ((0.2, 0.4), (0.7, 0.6))
    )
    request = make_request(bends=bends)
    result = calculate_level1_simulation(request)
    expected_attenuation = calculate_constant_attenuation(
        ConstantAttenuationRequest(
            length_km=request.section.length_km,
            attenuation_db_per_km=request.fibre.attenuation_db_per_km,
            input_power_dbm=request.source.input_power_dbm,
        )
    )
    expected_bend_loss = calculate_macrobend_loss(
        MacrobendLossRequest(
            input_power_dbm=expected_attenuation.output_power_dbm,
            bends=bends,
        )
    )

    assert result.attenuation == expected_attenuation
    assert result.bend_loss == expected_bend_loss
    assert result.attenuation.section_loss_db == 2.5
    assert result.attenuation.output_power_dbm == -5.5
    assert result.bend_loss.input_power_dbm == -5.5
    assert result.bend_loss.total_bend_loss_db == 1.0
    assert result.bend_loss.output_power_dbm == -6.5
    assert result.model_manifest.component_model_ids[3] == "user_supplied_macrobend_loss"


def test_result_rejects_bend_power_handoff_and_configuration_mismatches() -> None:
    request = make_request()
    result_values = calculate_level1_simulation(request).model_dump()
    bend_loss = result_values["bend_loss"]
    assert isinstance(bend_loss, dict)
    bend_loss["input_power_dbm"] = -5.4
    bend_loss["output_power_dbm"] = -5.4

    with pytest.raises(ValidationError) as power_error:
        Level1SimulationResult.model_validate(result_values)

    assert power_error.value.errors()[0]["type"] == "bend_loss_input_power_mismatch"

    bend = MacrobendInput.model_validate(
        {
            "position_fraction": 0.5,
            "radius_mm": 12.0,
            "angle_deg": 90.0,
            "supplied_loss_db": 0.4,
        }
    )
    configured_result_values = calculate_level1_simulation(make_request(bends=(bend,))).model_dump()
    configured_bend_loss = configured_result_values["bend_loss"]
    assert isinstance(configured_bend_loss, dict)
    result_bends = configured_bend_loss["bends"]
    assert isinstance(result_bends, tuple)
    result_bends[0]["radius_mm"] = 13.0

    with pytest.raises(ValidationError) as configuration_error:
        Level1SimulationResult.model_validate(configured_result_values)

    assert configuration_error.value.errors()[0]["type"] == ("bend_loss_configuration_mismatch")


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
    assert result.model_manifest.component_model_ids[:6] == (
        "ideal_circular_step_index_guidance",
        "gaussian_lp01_mode_profile",
        "constant_fibre_attenuation",
        "user_supplied_macrobend_loss",
        "constant_group_index_delay",
        "first_order_chromatic_pulse_broadening",
    )
    assert result.model_manifest.component_model_ids[6:] == (
        checks.preset_definition.model_id,
        checks.dispersion.model_manifest.envelope_model_id,
        checks.dispersion.model_manifest.model_id,
        checks.attenuation.model_manifest.model_id,
    )
    assert result.model_manifest.model_version == "1.1.0"


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
