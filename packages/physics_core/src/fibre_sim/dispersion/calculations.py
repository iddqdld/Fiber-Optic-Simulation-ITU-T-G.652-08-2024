import math

from .constants import VACUUM_SPEED_M_PER_S
from .request import ChromaticPulseBroadeningRequest, GroupDelayRequest
from .result import (
    ChromaticPulseBroadeningManifest,
    ChromaticPulseBroadeningResult,
    GroupDelayManifest,
    GroupDelayResult,
)


class ChromaticPulseBroadeningCalculationError(ValueError):
    pass


class GroupDelayCalculationError(ValueError):
    pass


def calculate_chromatic_pulse_broadening(
    request: ChromaticPulseBroadeningRequest,
) -> ChromaticPulseBroadeningResult:
    accumulated_dispersion_ps_per_nm = request.dispersion_ps_per_nm_km * request.length_km
    if not math.isfinite(accumulated_dispersion_ps_per_nm):
        raise ChromaticPulseBroadeningCalculationError(
            "Chromatic pulse broadening calculation produced a non-finite result."
        )

    dispersion_broadening_fwhm_ps = (
        abs(accumulated_dispersion_ps_per_nm) * request.spectral_width_fwhm_nm
    )
    if dispersion_broadening_fwhm_ps == 0.0:
        dispersion_broadening_fwhm_ps = 0.0
    if not math.isfinite(dispersion_broadening_fwhm_ps):
        raise ChromaticPulseBroadeningCalculationError(
            "Chromatic pulse broadening calculation produced a non-finite result."
        )

    output_pulse_fwhm_ps = math.hypot(
        request.input_pulse_fwhm_ps,
        dispersion_broadening_fwhm_ps,
    )
    if not math.isfinite(output_pulse_fwhm_ps):
        raise ChromaticPulseBroadeningCalculationError(
            "Chromatic pulse broadening calculation produced a non-finite result."
        )

    return ChromaticPulseBroadeningResult(
        length_km=request.length_km,
        dispersion_ps_per_nm_km=request.dispersion_ps_per_nm_km,
        spectral_width_fwhm_nm=request.spectral_width_fwhm_nm,
        input_pulse_fwhm_ps=request.input_pulse_fwhm_ps,
        accumulated_dispersion_ps_per_nm=accumulated_dispersion_ps_per_nm,
        dispersion_broadening_fwhm_ps=dispersion_broadening_fwhm_ps,
        output_pulse_fwhm_ps=output_pulse_fwhm_ps,
        model_manifest=ChromaticPulseBroadeningManifest(),
    )


def calculate_group_delay(request: GroupDelayRequest) -> GroupDelayResult:
    group_delay_ps = (
        request.group_index_dimensionless
        * request.length_km
        * 1_000.0
        / VACUUM_SPEED_M_PER_S
        * 1e12
    )
    if group_delay_ps == 0.0:
        group_delay_ps = 0.0
    if not math.isfinite(group_delay_ps):
        raise GroupDelayCalculationError("Group delay calculation produced a non-finite result.")
    return GroupDelayResult(
        length_km=request.length_km,
        group_index_dimensionless=request.group_index_dimensionless,
        group_delay_ps=group_delay_ps,
        model_manifest=GroupDelayManifest(),
    )
