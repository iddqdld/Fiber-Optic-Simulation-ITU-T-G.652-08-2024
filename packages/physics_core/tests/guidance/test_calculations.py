import math

import pytest

from fibre_sim.guidance import (
    AirAcceptanceAngleError,
    GuidanceRequest,
    air_acceptance_angle_deg,
    critical_angle_deg,
    numerical_aperture,
    relative_index_difference,
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


def test_critical_angle_is_45_degrees_for_a_valid_request() -> None:
    request = make_request(2.0, math.sqrt(2.0))

    assert critical_angle_deg(request) == pytest.approx(45.0, rel=1e-12, abs=1e-12)


def test_numerical_aperture_and_air_acceptance_angle_have_analytical_values() -> None:
    request = make_request(1.5, math.sqrt(2.0))

    assert numerical_aperture(request) == pytest.approx(0.5, rel=1e-12, abs=1e-12)
    assert air_acceptance_angle_deg(request) == pytest.approx(30.0, rel=1e-12, abs=1e-12)


def test_air_acceptance_angle_allows_numerical_aperture_equal_to_one() -> None:
    request = make_request(1.25, 0.75)

    assert numerical_aperture(request) == pytest.approx(1.0, rel=1e-12, abs=1e-12)
    assert air_acceptance_angle_deg(request) == pytest.approx(90.0, rel=1e-12, abs=1e-12)


def test_relative_index_difference_uses_the_project_convention() -> None:
    request = make_request(1.5, 1.485)

    assert relative_index_difference(request) == pytest.approx(0.01, rel=1e-12, abs=1e-12)


def test_educational_weak_guidance_fixture_matches_reference_values() -> None:
    request = make_request(1.450, 1.444)

    assert critical_angle_deg(request) == pytest.approx(84.78590277783555, rel=1e-12, abs=1e-12)
    assert numerical_aperture(request) == pytest.approx(0.13177253128023367, rel=1e-12, abs=1e-12)
    assert air_acceptance_angle_deg(request) == pytest.approx(
        7.572032141901201, rel=1e-12, abs=1e-12
    )
    assert relative_index_difference(request) == pytest.approx(
        0.004137931034482762, rel=1e-12, abs=1e-12
    )


def test_numerical_aperture_handles_huge_finite_indices() -> None:
    request = make_request(1.0e308, 9.0e307)

    result = numerical_aperture(request)

    assert math.isfinite(result)
    assert result == pytest.approx(1.0e308 * math.sqrt(0.19), rel=1e-12, abs=0.0)


def test_repeated_calculations_are_deterministic() -> None:
    request = make_request(1.5, 1.45)

    first = (
        critical_angle_deg(request),
        numerical_aperture(request),
        air_acceptance_angle_deg(request),
        relative_index_difference(request),
    )
    second = (
        critical_angle_deg(request),
        numerical_aperture(request),
        air_acceptance_angle_deg(request),
        relative_index_difference(request),
    )

    assert second == first


def test_guidance_outputs_are_in_expected_ranges() -> None:
    request = make_request(1.5, 1.45)

    assert 0.0 < critical_angle_deg(request) < 90.0
    assert 0.0 < numerical_aperture(request) <= 1.0
    assert 0.0 < air_acceptance_angle_deg(request) <= 90.0
    assert 0.0 < relative_index_difference(request) < 1.0


def test_guidance_trends_are_monotonic_as_cladding_index_increases() -> None:
    requests = [
        make_request(1.5, 1.3),
        make_request(1.5, 1.4),
        make_request(1.5, 1.49),
    ]

    critical_angles = [critical_angle_deg(request) for request in requests]
    numerical_apertures = [numerical_aperture(request) for request in requests]
    air_acceptance_angles = [air_acceptance_angle_deg(request) for request in requests]
    relative_index_differences = [relative_index_difference(request) for request in requests]

    assert critical_angles[0] < critical_angles[1] < critical_angles[2]
    assert numerical_apertures[0] > numerical_apertures[1] > numerical_apertures[2]
    assert air_acceptance_angles[0] > air_acceptance_angles[1] > air_acceptance_angles[2]
    assert (
        relative_index_differences[0]
        > relative_index_differences[1]
        > relative_index_differences[2]
    )


def test_guidance_calculations_are_independent_of_radius_and_wavelength() -> None:
    baseline = make_request(1.5, 1.45, core_radius_um=4.1, wavelength_nm=1550.0)
    variant = make_request(1.5, 1.45, core_radius_um=25.0, wavelength_nm=850.0)

    assert critical_angle_deg(variant) == pytest.approx(
        critical_angle_deg(baseline), rel=1e-12, abs=1e-12
    )
    assert numerical_aperture(variant) == pytest.approx(
        numerical_aperture(baseline), rel=1e-12, abs=1e-12
    )
    assert air_acceptance_angle_deg(variant) == pytest.approx(
        air_acceptance_angle_deg(baseline), rel=1e-12, abs=1e-12
    )
    assert relative_index_difference(variant) == pytest.approx(
        relative_index_difference(baseline), rel=1e-12, abs=1e-12
    )


def test_air_acceptance_angle_rejects_numerical_aperture_above_one() -> None:
    request = make_request(2.0, 1.0)
    message = "Inverse-sine air acceptance-angle model requires numerical aperture <= 1."

    assert numerical_aperture(request) > 1.0
    with pytest.raises(AirAcceptanceAngleError) as exc_info:
        air_acceptance_angle_deg(request)

    assert str(exc_info.value) == message
