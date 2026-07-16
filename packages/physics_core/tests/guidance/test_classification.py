import math

import pytest

from fibre_sim.guidance import (
    LP11_CUTOFF_V,
    GuidanceRequest,
    ModeRegime,
    classify_mode_regime,
    numerical_aperture,
    v_number,
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


def request_for_v(target_v: float, *, boundary: bool = False) -> GuidanceRequest:
    wavelength_nm = 1000.0
    reference = make_request(1.5, math.sqrt(2.0), core_radius_um=1.0, wavelength_nm=wavelength_nm)
    radius_um = target_v * wavelength_nm / (2.0 * math.pi * 1000.0 * numerical_aperture(reference))
    if boundary:
        radius_um = math.nextafter(radius_um, math.inf)
    return make_request(
        1.5,
        math.sqrt(2.0),
        core_radius_um=radius_um,
        wavelength_nm=wavelength_nm,
    )


def test_mode_regime_values_and_cutoff_are_stable() -> None:
    assert LP11_CUTOFF_V == 2.405
    assert [regime.value for regime in ModeRegime] == ["single_mode", "multimode"]
    assert str(ModeRegime.SINGLE_MODE) == "single_mode"
    assert str(ModeRegime.MULTIMODE) == "multimode"


@pytest.mark.parametrize(
    ("target_v", "expected_regime", "boundary"),
    [
        (LP11_CUTOFF_V - 1e-6, ModeRegime.SINGLE_MODE, False),
        (LP11_CUTOFF_V, ModeRegime.MULTIMODE, True),
        (LP11_CUTOFF_V + 1e-6, ModeRegime.MULTIMODE, False),
    ],
    ids=["immediately-below", "at-cutoff", "immediately-above"],
)
def test_classification_uses_the_strict_below_and_inclusive_cutoff_branches(
    target_v: float,
    expected_regime: ModeRegime,
    boundary: bool,
) -> None:
    request = request_for_v(target_v, boundary=boundary)
    actual_v = v_number(request)

    assert actual_v == pytest.approx(target_v, rel=0.0, abs=V_TOLERANCE)
    if expected_regime is ModeRegime.SINGLE_MODE:
        assert actual_v < LP11_CUTOFF_V
    else:
        assert actual_v >= LP11_CUTOFF_V
    assert classify_mode_regime(request) is expected_regime


def test_educational_reference_is_ideal_single_mode_not_g652d_conformance() -> None:
    request = make_request(1.450, 1.444, core_radius_um=4.1, wavelength_nm=1550.0)

    assert v_number(request) == pytest.approx(2.19006455, rel=0.0, abs=5e-9)
    assert classify_mode_regime(request) is ModeRegime.SINGLE_MODE


def test_wavelength_change_can_cross_the_mode_regime_boundary() -> None:
    long_wavelength = make_request(1.450, 1.444, core_radius_um=4.1, wavelength_nm=1550.0)
    short_wavelength = make_request(1.450, 1.444, core_radius_um=4.1, wavelength_nm=1400.0)

    assert v_number(long_wavelength) < LP11_CUTOFF_V
    assert v_number(short_wavelength) >= LP11_CUTOFF_V
    assert classify_mode_regime(long_wavelength) is ModeRegime.SINGLE_MODE
    assert classify_mode_regime(short_wavelength) is ModeRegime.MULTIMODE


def test_classification_is_deterministic_for_a_valid_request() -> None:
    request = make_request(1.450, 1.444, core_radius_um=4.1, wavelength_nm=1550.0)

    assert classify_mode_regime(request) is classify_mode_regime(request)
