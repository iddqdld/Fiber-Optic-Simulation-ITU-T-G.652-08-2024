import math

import pytest

from fibre_sim.guidance import (
    ASYMPTOTIC_MODE_COUNT_MIN_V,
    GuidanceRequest,
    ModeCountValidityError,
    approximate_mode_count,
    numerical_aperture,
    v_number,
)

MODE_COUNT_VALIDITY_MESSAGE = (
    "V^2/2 estimate requires V >= 10.0 under the project validity policy "
    "(clearly highly multimode regime)."
)
V_TOLERANCE = 1e-12


def make_request(
    n_core: float,
    n_cladding: float,
    core_radius_um: float = 4.1,
    wavelength_nm: float = 1550.0,
) -> GuidanceRequest:
    return GuidanceRequest(
        n_core=n_core,
        n_cladding=n_cladding,
        core_radius_um=core_radius_um,
        wavelength_nm=wavelength_nm,
    )


def request_for_v(target_v: float, *, at_boundary: bool = False) -> GuidanceRequest:
    wavelength_nm = 1000.0
    reference = make_request(
        1.5,
        math.sqrt(2.0),
        core_radius_um=1.0,
        wavelength_nm=wavelength_nm,
    )
    radius_um = target_v * wavelength_nm / (2.0 * math.pi * 1000.0 * numerical_aperture(reference))
    if at_boundary:
        radius_um = math.nextafter(radius_um, math.inf)
    return make_request(
        1.5,
        math.sqrt(2.0),
        core_radius_um=radius_um,
        wavelength_nm=wavelength_nm,
    )


def test_mode_count_policy_constant_and_error_type_are_stable() -> None:
    assert ASYMPTOTIC_MODE_COUNT_MIN_V == 10.0
    assert issubclass(ModeCountValidityError, ValueError)


def test_mode_count_rejects_v_below_the_conservative_policy_boundary() -> None:
    request = request_for_v(9.999)

    assert v_number(request) < ASYMPTOTIC_MODE_COUNT_MIN_V
    with pytest.raises(ModeCountValidityError) as exc_info:
        approximate_mode_count(request)

    assert str(exc_info.value) == MODE_COUNT_VALIDITY_MESSAGE


def test_mode_count_accepts_v_at_ten_and_returns_fifty() -> None:
    request = request_for_v(10.0, at_boundary=True)
    actual_v = v_number(request)

    assert actual_v >= ASYMPTOTIC_MODE_COUNT_MIN_V
    assert actual_v == pytest.approx(10.0, rel=0.0, abs=V_TOLERANCE)
    assert approximate_mode_count(request) == pytest.approx(50.0, rel=0.0, abs=1e-11)


def test_mode_count_preserves_non_integer_asymptotic_result() -> None:
    request = request_for_v(10.1)
    actual_v = v_number(request)
    result = approximate_mode_count(request)

    assert actual_v == pytest.approx(10.1, rel=0.0, abs=V_TOLERANCE)
    assert isinstance(result, float)
    assert result == pytest.approx(51.005, rel=0.0, abs=1e-11)
    assert not result.is_integer()


def test_mode_count_scales_with_the_square_of_v_and_is_deterministic() -> None:
    request = request_for_v(10.1)
    doubled_v_request = request_for_v(20.2)

    first = approximate_mode_count(request)
    second = approximate_mode_count(request)
    scaled = approximate_mode_count(doubled_v_request)

    assert second == first
    assert scaled == pytest.approx(4.0 * first, rel=1e-12, abs=1e-12)
