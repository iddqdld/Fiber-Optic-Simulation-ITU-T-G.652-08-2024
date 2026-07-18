import math

import pytest

from fibre_sim.guidance import GuidanceRequest, numerical_aperture, v_number


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


def test_v_number_converts_radius_and_wavelength_to_common_units() -> None:
    request = make_request(1.5, math.sqrt(2.0), core_radius_um=1.0, wavelength_nm=1000.0)

    assert v_number(request) == pytest.approx(math.pi, rel=1e-12, abs=1e-12)


def test_educational_fundamentals_reference_is_not_g652d_cutoff() -> None:
    request = make_request(1.450, 1.444, core_radius_um=4.1, wavelength_nm=1550.0)

    assert v_number(request) == pytest.approx(2.19006455, rel=0.0, abs=5e-9)


def test_constructed_2405_value_is_only_a_numerical_formula_boundary() -> None:
    request = make_request(
        1.5,
        math.sqrt(2.0),
        core_radius_um=2.405 / math.pi,
        wavelength_nm=1000.0,
    )

    assert v_number(request) == pytest.approx(2.405, rel=1e-12, abs=1e-12)


def test_v_number_increases_with_radius_and_index_contrast_and_decreases_with_wavelength() -> None:
    baseline = make_request(1.5, 1.45, core_radius_um=4.1, wavelength_nm=1550.0)
    larger_radius = make_request(1.5, 1.45, core_radius_um=5.0, wavelength_nm=1550.0)
    greater_contrast = make_request(1.5, 1.44, core_radius_um=4.1, wavelength_nm=1550.0)
    longer_wavelength = make_request(1.5, 1.45, core_radius_um=4.1, wavelength_nm=1600.0)

    assert v_number(larger_radius) > v_number(baseline)
    assert v_number(greater_contrast) > v_number(baseline)
    assert v_number(longer_wavelength) < v_number(baseline)


def test_v_number_is_positive_and_deterministic_for_a_valid_request() -> None:
    request = make_request(1.5, 1.45)

    first = v_number(request)
    second = v_number(request)

    assert first > 0.0
    assert second == first


def test_v_number_handles_equal_subnormal_radius_and_wavelength() -> None:
    subnormal = math.nextafter(0.0, math.inf)
    request = make_request(1.5, 1.4, core_radius_um=subnormal, wavelength_nm=subnormal)

    result = v_number(request)
    expected = 2.0 * math.pi * 1_000.0 * numerical_aperture(request)

    assert math.isfinite(result)
    assert result == pytest.approx(expected, rel=1e-15, abs=1e-12)


@pytest.mark.parametrize(
    ("core_radius_um", "wavelength_nm", "scale"),
    [
        (4.1, 1550.0, 3.5),
        (math.nextafter(0.0, math.inf), math.nextafter(0.0, math.inf), 2.0),
    ],
)
def test_v_number_is_invariant_under_common_radius_and_wavelength_scaling(
    core_radius_um: float, wavelength_nm: float, scale: float
) -> None:
    baseline = make_request(1.5, 1.4, core_radius_um, wavelength_nm)
    scaled = make_request(1.5, 1.4, core_radius_um * scale, wavelength_nm * scale)

    assert v_number(scaled) == pytest.approx(v_number(baseline), rel=1e-14, abs=1e-12)
