from fibre_sim.attenuation import ConstantAttenuationRequest, calculate_constant_attenuation
from fibre_sim.bends import MacrobendLossRequest, calculate_macrobend_loss
from fibre_sim.dispersion import (
    ChromaticPulseBroadeningRequest,
    GroupDelayRequest,
    calculate_chromatic_pulse_broadening,
    calculate_group_delay,
)
from fibre_sim.guidance import GuidanceRequest, calculate_guidance
from fibre_sim.modes import GaussianModeProfileRequest, calculate_gaussian_mode_profile
from fibre_sim.standards import (
    G652DAttenuationCheckRequest,
    G652DAttenuationCheckStatus,
    G652DDispersionCheckRequest,
    check_g652d_attenuation,
    check_g652d_dispersion,
    get_g652d_preset,
)

from .boundaries import build_level1_parameter_boundaries
from .request import Level1FibrePreset, Level1SimulationRequest
from .result import (
    Level1SimulationManifest,
    Level1SimulationResult,
    Level1StandardsChecks,
    Level1Warning,
    Level1WarningCode,
)


def calculate_level1_simulation(request: Level1SimulationRequest) -> Level1SimulationResult:
    fibre = request.fibre
    source = request.source
    section = request.section
    sampling = request.sampling

    guidance = calculate_guidance(
        GuidanceRequest(
            n_core=fibre.n_core,
            n_cladding=fibre.n_cladding,
            core_radius_um=fibre.core_radius_um,
            wavelength_nm=source.wavelength_nm,
        )
    )
    mode_profile = calculate_gaussian_mode_profile(
        GaussianModeProfileRequest(
            mode_field_radius_um=fibre.mode_field_radius_um,
            grid_half_width_um=sampling.grid_half_width_um,
            grid_points=sampling.grid_points,
        )
    )
    attenuation = calculate_constant_attenuation(
        ConstantAttenuationRequest(
            length_km=section.length_km,
            attenuation_db_per_km=fibre.attenuation_db_per_km,
            input_power_dbm=source.input_power_dbm,
        )
    )
    bend_loss = calculate_macrobend_loss(
        MacrobendLossRequest(
            input_power_dbm=attenuation.output_power_dbm,
            bends=section.bends,
        )
    )
    group_delay = calculate_group_delay(
        GroupDelayRequest(
            length_km=section.length_km,
            group_index_dimensionless=fibre.group_index_dimensionless,
        )
    )
    pulse_broadening = calculate_chromatic_pulse_broadening(
        ChromaticPulseBroadeningRequest(
            length_km=section.length_km,
            dispersion_ps_per_nm_km=fibre.dispersion_ps_per_nm_km,
            spectral_width_fwhm_nm=source.spectral_width_fwhm_nm,
            input_pulse_fwhm_ps=source.input_pulse_fwhm_ps,
        )
    )

    warnings = [
        Level1Warning(
            code=Level1WarningCode(guidance_warning.code.value),
            source_model_id=guidance.model_manifest.model_id,
            message=guidance_warning.message,
            output_field=guidance_warning.output_field,
        )
        for guidance_warning in guidance.warnings
    ]
    component_model_ids = [
        guidance.model_manifest.model_id,
        mode_profile.model_manifest.model_id,
        attenuation.model_manifest.model_id,
        bend_loss.model_manifest.model_id,
        group_delay.model_manifest.model_id,
        pulse_broadening.model_manifest.model_id,
    ]

    if request.preset is Level1FibrePreset.CUSTOM:
        standards_checks = Level1StandardsChecks(
            preset=Level1FibrePreset.CUSTOM,
            preset_definition=None,
            dispersion=None,
            attenuation=None,
        )
    else:
        preset = get_g652d_preset()
        dispersion_check = check_g652d_dispersion(
            G652DDispersionCheckRequest(
                wavelength_nm=source.wavelength_nm,
                supplied_dispersion_ps_per_nm_km=fibre.dispersion_ps_per_nm_km,
            )
        )
        attenuation_check = check_g652d_attenuation(
            G652DAttenuationCheckRequest(
                wavelength_nm=source.wavelength_nm,
                attenuation_db_per_km=fibre.attenuation_db_per_km,
                cable_application=fibre.cable_application,
            )
        )
        standards_checks = Level1StandardsChecks(
            preset=Level1FibrePreset.G652D,
            preset_definition=preset,
            dispersion=dispersion_check,
            attenuation=attenuation_check,
        )
        component_model_ids.extend(
            (
                preset.model_id,
                dispersion_check.model_manifest.envelope_model_id,
                dispersion_check.model_manifest.model_id,
                attenuation_check.model_manifest.model_id,
            )
        )
        if attenuation_check.status is G652DAttenuationCheckStatus.NOT_APPLICABLE:
            assert attenuation_check.not_applicable_reason is not None
            warnings.append(
                Level1Warning(
                    code=Level1WarningCode.G652D_ATTENUATION_NOT_APPLICABLE,
                    source_model_id=attenuation_check.model_manifest.model_id,
                    message=attenuation_check.not_applicable_reason,
                    output_field="standards_checks.attenuation",
                )
            )

    parameter_boundaries = build_level1_parameter_boundaries(
        request=request,
        guidance=guidance,
        standards_checks=standards_checks,
    )
    manifest = Level1SimulationManifest(component_model_ids=tuple(component_model_ids))
    return Level1SimulationResult(
        configuration=request,
        guidance=guidance,
        mode_profile=mode_profile,
        attenuation=attenuation,
        bend_loss=bend_loss,
        group_delay=group_delay,
        pulse_broadening=pulse_broadening,
        standards_checks=standards_checks,
        parameter_boundaries=parameter_boundaries,
        warnings=tuple(warnings),
        model_manifest=manifest,
    )
