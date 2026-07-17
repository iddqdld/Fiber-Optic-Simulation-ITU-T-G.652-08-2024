from .constants import (
    G652D_LINEAR_MAX_INTERCEPT_PS_PER_NM_KM,
    G652D_LINEAR_MAX_SLOPE_PS_PER_NM2_KM,
    G652D_LINEAR_MIN_INTERCEPT_PS_PER_NM_KM,
    G652D_LINEAR_MIN_SLOPE_PS_PER_NM2_KM,
    G652D_TRANSITION_WAVELENGTH_NM,
    G652D_ZERO_DISPERSION_MAX_SLOPE_PS_PER_NM2_KM,
    G652D_ZERO_DISPERSION_MAX_WAVELENGTH_NM,
    G652D_ZERO_DISPERSION_MIN_SLOPE_PS_PER_NM2_KM,
    G652D_ZERO_DISPERSION_MIN_WAVELENGTH_NM,
)
from .request import G652DDispersionEnvelopeRequest
from .result import (
    G652DDispersionEnvelopeManifest,
    G652DDispersionEnvelopeResult,
    G652DDispersionFitRegion,
)


def _sellmeier_bound(wavelength: float, zero_wavelength: float, slope: float) -> float:
    return wavelength * slope / 4 * (1 - (zero_wavelength / wavelength) ** 4)


def calculate_g652d_dispersion_envelope(
    request: G652DDispersionEnvelopeRequest,
) -> G652DDispersionEnvelopeResult:
    wavelength = request.wavelength_nm

    if wavelength < G652D_ZERO_DISPERSION_MIN_WAVELENGTH_NM:
        minimum_dispersion = _sellmeier_bound(
            wavelength,
            G652D_ZERO_DISPERSION_MAX_WAVELENGTH_NM,
            G652D_ZERO_DISPERSION_MAX_SLOPE_PS_PER_NM2_KM,
        )
        maximum_dispersion = _sellmeier_bound(
            wavelength,
            G652D_ZERO_DISPERSION_MIN_WAVELENGTH_NM,
            G652D_ZERO_DISPERSION_MIN_SLOPE_PS_PER_NM2_KM,
        )
    elif wavelength < G652D_ZERO_DISPERSION_MAX_WAVELENGTH_NM:
        minimum_dispersion = _sellmeier_bound(
            wavelength,
            G652D_ZERO_DISPERSION_MAX_WAVELENGTH_NM,
            G652D_ZERO_DISPERSION_MAX_SLOPE_PS_PER_NM2_KM,
        )
        maximum_dispersion = _sellmeier_bound(
            wavelength,
            G652D_ZERO_DISPERSION_MIN_WAVELENGTH_NM,
            G652D_ZERO_DISPERSION_MAX_SLOPE_PS_PER_NM2_KM,
        )
    elif wavelength < G652D_TRANSITION_WAVELENGTH_NM:
        minimum_dispersion = _sellmeier_bound(
            wavelength,
            G652D_ZERO_DISPERSION_MAX_WAVELENGTH_NM,
            G652D_ZERO_DISPERSION_MIN_SLOPE_PS_PER_NM2_KM,
        )
        maximum_dispersion = _sellmeier_bound(
            wavelength,
            G652D_ZERO_DISPERSION_MIN_WAVELENGTH_NM,
            G652D_ZERO_DISPERSION_MAX_SLOPE_PS_PER_NM2_KM,
        )
    else:
        minimum_dispersion = G652D_LINEAR_MIN_INTERCEPT_PS_PER_NM_KM + (
            G652D_LINEAR_MIN_SLOPE_PS_PER_NM2_KM * (wavelength - G652D_TRANSITION_WAVELENGTH_NM)
        )
        maximum_dispersion = G652D_LINEAR_MAX_INTERCEPT_PS_PER_NM_KM + (
            G652D_LINEAR_MAX_SLOPE_PS_PER_NM2_KM * (wavelength - G652D_TRANSITION_WAVELENGTH_NM)
        )

    fit_region = (
        G652DDispersionFitRegion.THREE_TERM_SELLMEIER
        if wavelength < G652D_TRANSITION_WAVELENGTH_NM
        else G652DDispersionFitRegion.LINEAR
    )
    return G652DDispersionEnvelopeResult(
        wavelength_nm=request.wavelength_nm,
        fit_region=fit_region,
        minimum_dispersion_ps_per_nm_km=minimum_dispersion,
        maximum_dispersion_ps_per_nm_km=maximum_dispersion,
        model_manifest=G652DDispersionEnvelopeManifest(),
    )
