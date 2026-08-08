import math

import pytest

from fibre_sim.bends import (
    MacrobendInput,
    MacrobendLossRequest,
    MarcuseBendLossInput,
    MarcuseBendLossResult,
    MarcuseModelValidity,
    Point3D,
    PropagationConstantSource,
    add_path_convergence_error,
    calculate_macrobend_loss,
    calculate_marcuse_bend_loss,
    integrate_local_curvature_marcuse,
)
from fibre_sim.modes import ScalarLP01ModeSolution, solve_scalar_step_index_lp01

WAVELENGTH_M = 1.625e-6
CORE_RADIUS_M = 4.1e-6
CLADDING_RADIUS_M = 62.5e-6
N_CORE = 1.4504
N_CLADDING = 1.4447


def mode() -> ScalarLP01ModeSolution:
    return solve_scalar_step_index_lp01(
        wavelength_m=WAVELENGTH_M,
        core_radius_m=CORE_RADIUS_M,
        n_core=N_CORE,
        n_cladding=N_CLADDING,
    )


def bend(
    position: float = 0.5,
    radius_mm: float = 15.0,
    angle_deg: float = 360.0,
) -> MacrobendInput:
    return MacrobendInput(
        position_fraction=position,
        radius_mm=radius_mm,
        angle_deg=angle_deg,
    )


def request(
    *bends: MacrobendInput,
    beta_per_m: float | None = None,
) -> MacrobendLossRequest:
    return MacrobendLossRequest(
        wavelength_m=WAVELENGTH_M,
        core_radius_m=CORE_RADIUS_M,
        cladding_radius_m=CLADDING_RADIUS_M,
        n_core=N_CORE,
        n_cladding=N_CLADDING,
        input_power_dbm=-3.0,
        beta_per_m=beta_per_m,
        bends=bends,
    )


def marcuse(radius_m: float) -> MarcuseBendLossResult:
    return calculate_marcuse_bend_loss(
        MarcuseBendLossInput(
            wavelength_m=WAVELENGTH_M,
            core_radius_m=CORE_RADIUS_M,
            cladding_radius_m=CLADDING_RADIUS_M,
            n_core=N_CORE,
            n_cladding=N_CLADDING,
            beta_per_m=mode().beta_per_m,
            bend_radius_m=radius_m,
        )
    )


def circular_arc(radius_m: float, angle_rad: float, count: int) -> tuple[Point3D, ...]:
    return tuple(
        (
            radius_m * math.cos(angle_rad * index / (count - 1)),
            radius_m * math.sin(angle_rad * index / (count - 1)),
            0.0,
        )
        for index in range(count)
    )


def test_synthetic_marcuse_equation_fixture() -> None:
    solved = mode()
    result = marcuse(0.015)

    assert solved.v_number_dimensionless == pytest.approx(2.0364772942, rel=1e-10)
    assert solved.u_dimensionless == pytest.approx(1.5403857891, rel=1e-10)
    assert solved.w_dimensionless == pytest.approx(1.3320853541, rel=1e-10)
    assert solved.effective_index_dimensionless == pytest.approx(1.4471415684, rel=1e-10)
    assert solved.beta_per_m == pytest.approx(5.5954822399e6, rel=1e-10)
    assert result.kappa_per_m == pytest.approx(3.7570385101e5, rel=1e-10)
    assert result.gamma_per_m == pytest.approx(3.2489886685e5, rel=1e-10)
    assert result.alpha_power_per_m == pytest.approx(0.1846161533, rel=1e-9)
    assert result.scientific_label == ("Estimated LP01 macrobend radiation loss — Marcuse model")
    assert result.loss_db_per_m * 2.0 * math.pi * 0.015 == pytest.approx(
        0.0755657742,
        rel=1e-9,
    )


def test_straight_path_returns_exact_zero_loss_and_unchanged_power() -> None:
    result = calculate_macrobend_loss(request())

    assert result.total_bent_length_m == 0.0
    assert result.total_bend_loss_db == 0.0
    assert result.max_local_loss_db_per_m == 0.0
    assert result.minimum_bend_radius_m is None
    assert result.output_power_dbm == result.input_power_dbm
    assert result.bends == ()


def test_existing_beta_has_priority_over_the_fallback_solver() -> None:
    result = calculate_macrobend_loss(request(bend(), beta_per_m=mode().beta_per_m))

    assert result.beta_source is PropagationConstantSource.EXISTING_EFFECTIVE_INDEX
    assert result.beta_per_m == mode().beta_per_m


def test_fallback_scalar_mode_drives_the_constant_bend_result() -> None:
    result = calculate_macrobend_loss(request(bend()))

    assert result.beta_source is PropagationConstantSource.SCALAR_STEP_INDEX_LP01
    assert result.total_bend_loss_db == pytest.approx(0.0755657742, rel=1e-9)
    assert result.bends[0].estimated_radiation_loss_db == result.total_bend_loss_db
    assert result.output_power_dbm == pytest.approx(-3.0755657742, rel=1e-9)


def test_smaller_radius_strongly_increases_loss_for_equal_bent_length() -> None:
    small = calculate_macrobend_loss(request(bend(radius_mm=15.0, angle_deg=360.0)))
    large = calculate_macrobend_loss(request(bend(radius_mm=30.0, angle_deg=180.0)))

    assert small.total_bent_length_m == pytest.approx(large.total_bent_length_m)
    assert small.total_bend_loss_db > large.total_bend_loss_db * 1e4


def test_constant_radius_loss_scales_with_length_and_turn_count() -> None:
    half_turn = calculate_macrobend_loss(request(bend(angle_deg=180.0)))
    full_turn = calculate_macrobend_loss(request(bend(angle_deg=360.0)))
    ten_turns = calculate_macrobend_loss(
        request(*(bend(position=(index + 1) / 11, angle_deg=360.0) for index in range(10)))
    )

    assert full_turn.total_bend_loss_db == pytest.approx(2.0 * half_turn.total_bend_loss_db)
    assert ten_turns.total_bend_loss_db == pytest.approx(10.0 * full_turn.total_bend_loss_db)


def test_direction_does_not_change_scalar_isotropic_radiation_loss() -> None:
    left = calculate_macrobend_loss(request(bend()))
    right_bend = bend().model_copy(update={"direction": "right"})
    right = calculate_macrobend_loss(request(right_bend))

    assert left.total_bend_loss_db == right.total_bend_loss_db


def test_geometry_guard_marks_small_radii() -> None:
    warning = marcuse(0.005)
    outside = marcuse(0.001)

    assert warning.validity is MarcuseModelValidity.WARNING
    assert outside.validity is MarcuseModelValidity.OUTSIDE_MODEL_VALIDITY
    assert warning.warnings
    assert outside.warnings


def test_missing_custom_cladding_radius_has_an_explicit_warning() -> None:
    custom = MacrobendLossRequest(
        wavelength_m=WAVELENGTH_M,
        core_radius_m=CORE_RADIUS_M,
        cladding_radius_m=None,
        n_core=N_CORE,
        n_cladding=N_CLADDING,
        input_power_dbm=-3.0,
        bends=(bend(),),
    )

    result = calculate_macrobend_loss(custom)

    assert result.validity is MarcuseModelValidity.WARNING
    assert any("cladding radius is unavailable" in warning for warning in result.warnings)


def test_circular_arc_path_integral_matches_the_analytical_result() -> None:
    radius_m = 0.015
    angle_rad = math.pi / 2.0
    local = marcuse(radius_m)
    result = integrate_local_curvature_marcuse(
        circular_arc(radius_m, angle_rad, 257),
        wavelength_m=WAVELENGTH_M,
        core_radius_m=CORE_RADIUS_M,
        cladding_radius_m=CLADDING_RADIUS_M,
        n_core=N_CORE,
        n_cladding=N_CLADDING,
        beta_per_m=mode().beta_per_m,
    )
    analytical = local.loss_db_per_m * radius_m * angle_rad

    assert result.total_loss_db == pytest.approx(analytical, rel=1e-5)
    assert result.minimum_bend_radius_m == pytest.approx(radius_m, rel=1e-10)


def test_path_discretization_converges_below_the_required_tolerance() -> None:
    inputs = {
        "wavelength_m": WAVELENGTH_M,
        "core_radius_m": CORE_RADIUS_M,
        "cladding_radius_m": CLADDING_RADIUS_M,
        "n_core": N_CORE,
        "n_cladding": N_CLADDING,
        "beta_per_m": mode().beta_per_m,
    }
    coarse = integrate_local_curvature_marcuse(
        circular_arc(0.015, math.pi, 33),
        **inputs,
    )
    fine = integrate_local_curvature_marcuse(
        circular_arc(0.015, math.pi, 65),
        **inputs,
    )
    converged = add_path_convergence_error(coarse, fine)

    assert converged.convergence_error_db is not None
    assert converged.convergence_error_db < 1e-4
    assert converged.convergence_error_db / converged.total_loss_db < 1e-3


def test_sampled_straight_3d_path_returns_exact_zero() -> None:
    result = integrate_local_curvature_marcuse(
        ((0.0, 0.0, 0.0), (0.01, 0.01, 0.01), (0.02, 0.02, 0.02)),
        wavelength_m=WAVELENGTH_M,
        core_radius_m=CORE_RADIUS_M,
        cladding_radius_m=CLADDING_RADIUS_M,
        n_core=N_CORE,
        n_cladding=N_CLADDING,
        beta_per_m=mode().beta_per_m,
    )

    assert result.total_loss_db == 0.0
    assert result.minimum_bend_radius_m is None
    assert result.max_local_loss_db_per_m == 0.0
