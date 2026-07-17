import math

import pytest

import fibre_sim.modes as modes
import fibre_sim.modes.mode_field_radius as mode_field_radius
from fibre_sim.guidance import GuidanceRequest, v_number
from fibre_sim.modes import (
    MODE_FIELD_RADIUS_MAX_V,
    MODE_FIELD_RADIUS_MIN_V,
    ModeFieldRadiusValidityError,
    approximate_mode_field_radius_um,
)

MODE_FIELD_RADIUS_VALIDITY_MESSAGE = (
    "Mode-field radius approximation requires 1.2 <= V <= 2.4 under the project validity policy."
)


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


def set_v_number(monkeypatch: pytest.MonkeyPatch, value: float) -> None:
    def fake_v_number(_: GuidanceRequest) -> float:
        return value

    monkeypatch.setattr(mode_field_radius, "v_number", fake_v_number)


def test_mode_field_radius_public_exports_and_policy_constants_are_stable() -> None:
    assert MODE_FIELD_RADIUS_MIN_V == 1.2
    assert MODE_FIELD_RADIUS_MAX_V == 2.4
    assert issubclass(ModeFieldRadiusValidityError, ValueError)
    assert modes.approximate_mode_field_radius_um is approximate_mode_field_radius_um
    assert {
        "MODE_FIELD_RADIUS_MIN_V",
        "MODE_FIELD_RADIUS_MAX_V",
        "ModeFieldRadiusValidityError",
        "approximate_mode_field_radius_um",
    }.issubset(set(modes.__all__))


def test_authorized_reference_request_returns_expected_radius_and_diameter() -> None:
    request = make_request(1.45, 1.444, core_radius_um=4.1, wavelength_nm=1550.0)

    radius_um = approximate_mode_field_radius_um(request)

    assert radius_um == pytest.approx(4.820047955340122, rel=0.0, abs=1e-12)
    assert 2.0 * radius_um == pytest.approx(9.640095910680245, rel=0.0, abs=1e-12)


@pytest.mark.parametrize(
    ("v_value", "expected_radius_um"),
    [
        (1.5, 7.314497133205094),
        (1.8, 5.7607146121854536),
        (2.4, 4.512078066309108),
    ],
    ids=["v-1.5", "v-1.8", "v-2.4"],
)
def test_formula_uses_the_module_level_v_number(
    monkeypatch: pytest.MonkeyPatch, v_value: float, expected_radius_um: float
) -> None:
    request = make_request(1.45, 1.444)
    set_v_number(monkeypatch, v_value)

    radius_um = approximate_mode_field_radius_um(request)

    assert radius_um == pytest.approx(expected_radius_um, rel=1e-12, abs=1e-12)


@pytest.mark.parametrize("v_value", [MODE_FIELD_RADIUS_MIN_V, MODE_FIELD_RADIUS_MAX_V])
def test_exact_policy_boundaries_are_accepted(
    monkeypatch: pytest.MonkeyPatch, v_value: float
) -> None:
    request = make_request(1.45, 1.444)
    set_v_number(monkeypatch, v_value)

    radius_um = approximate_mode_field_radius_um(request)

    assert math.isfinite(radius_um)
    assert radius_um > 0.0


@pytest.mark.parametrize(
    "v_value",
    [
        math.nextafter(MODE_FIELD_RADIUS_MIN_V, -math.inf),
        math.nextafter(MODE_FIELD_RADIUS_MAX_V, math.inf),
    ],
    ids=["immediately-below-minimum", "immediately-above-maximum"],
)
def test_immediately_outside_policy_boundaries_are_rejected(
    monkeypatch: pytest.MonkeyPatch, v_value: float
) -> None:
    request = make_request(1.45, 1.444)
    set_v_number(monkeypatch, v_value)

    with pytest.raises(ModeFieldRadiusValidityError) as exc_info:
        approximate_mode_field_radius_um(request)

    assert exc_info.type is ModeFieldRadiusValidityError
    assert str(exc_info.value) == MODE_FIELD_RADIUS_VALIDITY_MESSAGE


def test_ideal_cutoff_value_2_405_is_rejected_by_the_conservative_policy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = make_request(1.45, 1.444)
    set_v_number(monkeypatch, 2.405)

    with pytest.raises(ModeFieldRadiusValidityError) as exc_info:
        approximate_mode_field_radius_um(request)

    assert MODE_FIELD_RADIUS_MAX_V < 2.405
    assert exc_info.type is ModeFieldRadiusValidityError
    assert str(exc_info.value) == MODE_FIELD_RADIUS_VALIDITY_MESSAGE


def test_common_radius_and_wavelength_scaling_preserves_v_and_scales_radius() -> None:
    request = make_request(1.45, 1.444, core_radius_um=4.1, wavelength_nm=1550.0)
    scaled_request = make_request(1.45, 1.444, core_radius_um=8.2, wavelength_nm=3100.0)

    base_v = v_number(request)
    scaled_v = v_number(scaled_request)
    base_radius_um = approximate_mode_field_radius_um(request)
    scaled_radius_um = approximate_mode_field_radius_um(scaled_request)

    assert scaled_v == pytest.approx(base_v, rel=0.0, abs=1e-14)
    assert scaled_radius_um == pytest.approx(2.0 * base_radius_um, rel=1e-12, abs=1e-12)


def test_normalized_mode_field_radius_decreases_across_valid_v_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = make_request(1.45, 1.444)
    normalized_radii = []

    for v_value in (1.2, 1.8, 2.4):
        set_v_number(monkeypatch, v_value)
        normalized_radii.append(approximate_mode_field_radius_um(request) / request.core_radius_um)

    assert normalized_radii[0] > normalized_radii[1] > normalized_radii[2]


def test_result_is_finite_positive_deterministic_and_does_not_mutate_request() -> None:
    request = make_request(1.45, 1.444)
    before = request.model_dump()

    first = approximate_mode_field_radius_um(request)
    second = approximate_mode_field_radius_um(request)

    assert math.isfinite(first)
    assert first > 0.0
    assert second == first
    assert request.model_dump() == before


def test_unrelated_v_number_exceptions_propagate(monkeypatch: pytest.MonkeyPatch) -> None:
    def raise_unrelated_error(_: GuidanceRequest) -> float:
        raise RuntimeError("unrelated V-number failure")

    monkeypatch.setattr(mode_field_radius, "v_number", raise_unrelated_error)

    with pytest.raises(RuntimeError, match="unrelated V-number failure"):
        approximate_mode_field_radius_um(make_request(1.45, 1.444))
