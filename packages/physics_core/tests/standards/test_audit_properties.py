import math

import pytest
from hypothesis import example, given, settings
from hypothesis import strategies as st
from pydantic import ValidationError

from fibre_sim.standards import (
    G652DAttenuationApplication,
    G652DAttenuationCheckRequest,
    G652DAttenuationCheckResult,
    G652DAttenuationCheckStatus,
    G652DAttenuationLimitBand,
    G652DDispersionEnvelopeRequest,
    G652DDispersionFitRegion,
    G652DStandardLimits,
    calculate_g652d_dispersion_envelope,
    check_g652d_attenuation,
)


def sellmeier_bound(wavelength_nm: float, zero_wavelength_nm: float, slope: float) -> float:
    return wavelength_nm * slope / 4.0 * (1.0 - (zero_wavelength_nm / wavelength_nm) ** 4)


def expected_dispersion_bounds(wavelength_nm: float) -> tuple[float, float]:
    if wavelength_nm < 1300.0:
        return (
            sellmeier_bound(wavelength_nm, 1324.0, 0.092),
            sellmeier_bound(wavelength_nm, 1300.0, 0.073),
        )
    if wavelength_nm < 1324.0:
        return (
            sellmeier_bound(wavelength_nm, 1324.0, 0.092),
            sellmeier_bound(wavelength_nm, 1300.0, 0.092),
        )
    if wavelength_nm < 1460.0:
        return (
            sellmeier_bound(wavelength_nm, 1324.0, 0.073),
            sellmeier_bound(wavelength_nm, 1300.0, 0.092),
        )
    return (
        8.625 + 0.052 * (wavelength_nm - 1460.0),
        12.472 + 0.068 * (wavelength_nm - 1460.0),
    )


def attenuation_result(
    wavelength_nm: float,
    attenuation_db_per_km: float,
    application: G652DAttenuationApplication = G652DAttenuationApplication.STANDARD_CABLE,
) -> G652DAttenuationCheckResult:
    return check_g652d_attenuation(
        G652DAttenuationCheckRequest(
            wavelength_nm=wavelength_nm,
            attenuation_db_per_km=attenuation_db_per_km,
            cable_application=application,
        )
    )


@given(
    st.floats(
        min_value=1260.0,
        max_value=1625.0,
        allow_nan=False,
        allow_infinity=False,
    )
)
@settings(max_examples=100, derandomize=True)
@example(1300.0)
@example(math.nextafter(1300.0, -math.inf))
@example(math.nextafter(1300.0, math.inf))
@example(1324.0)
@example(math.nextafter(1324.0, -math.inf))
@example(math.nextafter(1324.0, math.inf))
@example(1460.0)
@example(math.nextafter(1460.0, -math.inf))
@example(math.nextafter(1460.0, math.inf))
def test_dispersion_envelope_matches_each_exact_piecewise_boundary(
    wavelength_nm: float,
) -> None:
    result = calculate_g652d_dispersion_envelope(
        G652DDispersionEnvelopeRequest(wavelength_nm=wavelength_nm)
    )

    minimum, maximum = expected_dispersion_bounds(wavelength_nm)
    assert (result.minimum_dispersion_ps_per_nm_km, result.maximum_dispersion_ps_per_nm_km) == (
        minimum,
        maximum,
    )
    assert result.fit_region is (
        G652DDispersionFitRegion.LINEAR
        if wavelength_nm >= 1460.0
        else G652DDispersionFitRegion.THREE_TERM_SELLMEIER
    )
    assert math.isfinite(minimum)
    assert math.isfinite(maximum)
    assert minimum <= maximum


@pytest.mark.parametrize(
    ("wavelength_nm", "expected_band"),
    [
        (1260.0, None),
        (math.nextafter(1260.0, math.inf), None),
        (math.nextafter(1310.0, -math.inf), None),
        (1310.0, G652DAttenuationLimitBand.GENERAL_1310_1625),
        (math.nextafter(1310.0, math.inf), G652DAttenuationLimitBand.GENERAL_1310_1625),
        (math.nextafter(1530.0, -math.inf), G652DAttenuationLimitBand.GENERAL_1310_1625),
        (1530.0, G652DAttenuationLimitBand.C_BAND_1530_1565),
        (math.nextafter(1530.0, math.inf), G652DAttenuationLimitBand.C_BAND_1530_1565),
        (math.nextafter(1565.0, -math.inf), G652DAttenuationLimitBand.C_BAND_1530_1565),
        (1565.0, G652DAttenuationLimitBand.C_BAND_1530_1565),
        (math.nextafter(1565.0, math.inf), G652DAttenuationLimitBand.GENERAL_1310_1625),
        (math.nextafter(1625.0, -math.inf), G652DAttenuationLimitBand.GENERAL_1310_1625),
        (1625.0, G652DAttenuationLimitBand.GENERAL_1310_1625),
    ],
)
def test_attenuation_domain_and_band_neighbors_are_exact(
    wavelength_nm: float,
    expected_band: G652DAttenuationLimitBand | None,
) -> None:
    result = attenuation_result(wavelength_nm, 0.0)

    if expected_band is None:
        assert result.status is G652DAttenuationCheckStatus.NOT_APPLICABLE
        assert result.limit_band is None
    else:
        assert result.status is G652DAttenuationCheckStatus.PASS
        assert result.limit_band is expected_band
        assert result.maximum_attenuation_db_per_km == (
            0.3 if expected_band is G652DAttenuationLimitBand.C_BAND_1530_1565 else 0.4
        )


@pytest.mark.parametrize(
    ("wavelength_nm", "error_type"),
    [
        (math.nextafter(1260.0, -math.inf), "greater_than_equal"),
        (math.nextafter(1625.0, math.inf), "less_than_equal"),
    ],
)
def test_attenuation_request_domain_neighbors_are_rejected(
    wavelength_nm: float,
    error_type: str,
) -> None:
    with pytest.raises(ValidationError) as exc_info:
        attenuation_result(wavelength_nm, 0.0)

    assert exc_info.value.errors()[0]["type"] == error_type


@given(
    wavelength_nm=st.floats(
        min_value=1260.0,
        max_value=1625.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    attenuation_db_per_km=st.floats(
        min_value=0.0,
        max_value=0.4,
        allow_nan=False,
        allow_infinity=False,
    ),
)
@settings(max_examples=100, derandomize=True)
def test_attenuation_status_and_limit_are_consistent_over_finite_domain(
    wavelength_nm: float,
    attenuation_db_per_km: float,
) -> None:
    result = attenuation_result(wavelength_nm, attenuation_db_per_km)

    if wavelength_nm < 1310.0:
        assert result.status is G652DAttenuationCheckStatus.NOT_APPLICABLE
        return

    expected_limit = 0.3 if 1530.0 <= wavelength_nm <= 1565.0 else 0.4
    assert result.maximum_attenuation_db_per_km == expected_limit
    assert result.status is (
        G652DAttenuationCheckStatus.PASS
        if attenuation_db_per_km <= expected_limit
        else G652DAttenuationCheckStatus.FAIL_ABOVE_MAXIMUM
    )
    assert result.margin_below_maximum_db_per_km == expected_limit - attenuation_db_per_km


@given(st.sampled_from(tuple(G652DAttenuationApplication)))
@settings(max_examples=20, derandomize=True)
def test_each_attenuation_application_has_explicit_scope_behavior(
    application: G652DAttenuationApplication,
) -> None:
    result = attenuation_result(1550.0, 0.0, application)

    if application is G652DAttenuationApplication.STANDARD_CABLE:
        assert result.status is G652DAttenuationCheckStatus.PASS
        assert result.limit_band is G652DAttenuationLimitBand.C_BAND_1530_1565
    else:
        assert result.status is G652DAttenuationCheckStatus.NOT_APPLICABLE
        assert result.limit_band is None
        assert result.maximum_attenuation_db_per_km is None
        assert result.margin_below_maximum_db_per_km is None


@pytest.mark.parametrize(
    ("minimum_field", "maximum_field", "minimum", "maximum", "error_type"),
    [
        (
            "mode_field_diameter_nominal_min_um",
            "mode_field_diameter_nominal_max_um",
            9.2,
            8.6,
            "g652d_mfd_nominal_range_reversed",
        ),
        (
            "attenuation_general_min_wavelength_nm",
            "attenuation_general_max_wavelength_nm",
            1600.0,
            1500.0,
            "g652d_general_attenuation_range_reversed",
        ),
        (
            "attenuation_c_band_min_wavelength_nm",
            "attenuation_c_band_max_wavelength_nm",
            1560.0,
            1540.0,
            "g652d_c_band_range_reversed",
        ),
    ],
)
def test_all_ordered_preset_ranges_reject_reversed_values(
    minimum_field: str,
    maximum_field: str,
    minimum: float,
    maximum: float,
    error_type: str,
) -> None:
    values = G652DStandardLimits().model_dump()
    values[minimum_field] = minimum
    values[maximum_field] = maximum

    with pytest.raises(ValidationError) as exc_info:
        G652DStandardLimits.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == error_type


def test_all_ordered_preset_ranges_accept_equal_values() -> None:
    values = G652DStandardLimits().model_dump()
    values.update(
        {
            "mode_field_diameter_nominal_min_um": 8.6,
            "mode_field_diameter_nominal_max_um": 8.6,
            "attenuation_general_min_wavelength_nm": 1310.0,
            "attenuation_general_max_wavelength_nm": 1310.0,
            "attenuation_c_band_min_wavelength_nm": 1530.0,
            "attenuation_c_band_max_wavelength_nm": 1530.0,
        }
    )

    limits = G652DStandardLimits.model_validate(values)

    assert limits.mode_field_diameter_nominal_min_um == limits.mode_field_diameter_nominal_max_um
    assert (
        limits.attenuation_general_min_wavelength_nm == limits.attenuation_general_max_wavelength_nm
    )
    assert (
        limits.attenuation_c_band_min_wavelength_nm == limits.attenuation_c_band_max_wavelength_nm
    )
