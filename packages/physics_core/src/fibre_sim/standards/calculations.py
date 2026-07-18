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
from .preset import G652DStandardLimits
from .request import (
    G652DAttenuationCheckRequest,
    G652DDispersionCheckRequest,
    G652DDispersionEnvelopeRequest,
)
from .result import (
    G652DAttenuationApplication,
    G652DAttenuationCheckManifest,
    G652DAttenuationCheckResult,
    G652DAttenuationCheckStatus,
    G652DAttenuationLimitBand,
    G652DDispersionCheckManifest,
    G652DDispersionCheckResult,
    G652DDispersionCheckStatus,
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


def check_g652d_dispersion(
    request: G652DDispersionCheckRequest,
) -> G652DDispersionCheckResult:
    envelope = calculate_g652d_dispersion_envelope(
        G652DDispersionEnvelopeRequest(wavelength_nm=request.wavelength_nm)
    )
    supplied_dispersion = request.supplied_dispersion_ps_per_nm_km
    margin_above_minimum = supplied_dispersion - envelope.minimum_dispersion_ps_per_nm_km
    margin_below_maximum = envelope.maximum_dispersion_ps_per_nm_km - supplied_dispersion
    if margin_above_minimum == 0.0:
        margin_above_minimum = 0.0
    if margin_below_maximum == 0.0:
        margin_below_maximum = 0.0

    if supplied_dispersion < envelope.minimum_dispersion_ps_per_nm_km:
        status = G652DDispersionCheckStatus.FAIL_BELOW_MINIMUM
    elif supplied_dispersion > envelope.maximum_dispersion_ps_per_nm_km:
        status = G652DDispersionCheckStatus.FAIL_ABOVE_MAXIMUM
    else:
        status = G652DDispersionCheckStatus.PASS

    return G652DDispersionCheckResult(
        wavelength_nm=request.wavelength_nm,
        supplied_dispersion_ps_per_nm_km=supplied_dispersion,
        fit_region=envelope.fit_region,
        minimum_dispersion_ps_per_nm_km=envelope.minimum_dispersion_ps_per_nm_km,
        maximum_dispersion_ps_per_nm_km=envelope.maximum_dispersion_ps_per_nm_km,
        margin_above_minimum_ps_per_nm_km=margin_above_minimum,
        margin_below_maximum_ps_per_nm_km=margin_below_maximum,
        status=status,
        model_manifest=G652DDispersionCheckManifest(),
    )


def check_g652d_attenuation(
    request: G652DAttenuationCheckRequest,
) -> G652DAttenuationCheckResult:
    limits = G652DStandardLimits()
    if request.cable_application is not G652DAttenuationApplication.STANDARD_CABLE:
        return G652DAttenuationCheckResult(
            wavelength_nm=request.wavelength_nm,
            supplied_attenuation_db_per_km=request.attenuation_db_per_km,
            cable_application=request.cable_application,
            status=G652DAttenuationCheckStatus.NOT_APPLICABLE,
            not_applicable_reason=(
                "G.652.D Table 2 attenuation values are not intended for short jumpers, "
                "indoor cables, or drop cables."
            ),
            model_manifest=G652DAttenuationCheckManifest(),
        )

    if request.wavelength_nm < limits.attenuation_general_min_wavelength_nm:
        return G652DAttenuationCheckResult(
            wavelength_nm=request.wavelength_nm,
            supplied_attenuation_db_per_km=request.attenuation_db_per_km,
            cable_application=request.cable_application,
            status=G652DAttenuationCheckStatus.NOT_APPLICABLE,
            not_applicable_reason=(
                "Table 2's direct broad attenuation limit begins at 1310 nm; the "
                "1260-1310 nm extension note requires a measured 1310 nm value."
            ),
            model_manifest=G652DAttenuationCheckManifest(),
        )

    if (
        limits.attenuation_c_band_min_wavelength_nm
        <= request.wavelength_nm
        <= limits.attenuation_c_band_max_wavelength_nm
    ):
        limit_band = G652DAttenuationLimitBand.C_BAND_1530_1565
        maximum_attenuation = limits.attenuation_c_band_max_db_per_km
    else:
        limit_band = G652DAttenuationLimitBand.GENERAL_1310_1625
        maximum_attenuation = limits.attenuation_general_max_db_per_km

    margin_below_maximum = maximum_attenuation - request.attenuation_db_per_km
    if margin_below_maximum == 0.0:
        margin_below_maximum = 0.0
    status = (
        G652DAttenuationCheckStatus.PASS
        if request.attenuation_db_per_km <= maximum_attenuation
        else G652DAttenuationCheckStatus.FAIL_ABOVE_MAXIMUM
    )
    return G652DAttenuationCheckResult(
        wavelength_nm=request.wavelength_nm,
        supplied_attenuation_db_per_km=request.attenuation_db_per_km,
        cable_application=request.cable_application,
        limit_band=limit_band,
        maximum_attenuation_db_per_km=maximum_attenuation,
        margin_below_maximum_db_per_km=margin_below_maximum,
        status=status,
        model_manifest=G652DAttenuationCheckManifest(),
    )
