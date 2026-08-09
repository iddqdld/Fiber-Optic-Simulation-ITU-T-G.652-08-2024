import math

import pytest

from fibre_sim.modes import (
    ScalarLP01ModeSolution,
    ScalarLPModeSolveError,
    scalar_lp_mode_cutoff_v,
    solve_scalar_step_index_lp01,
    solve_scalar_step_index_lp_mode,
    supported_scalar_lp_mode_indices,
)

BASE_PARAMETERS = {
    "wavelength_m": 1.55e-6,
    "n_core": 1.45,
    "n_cladding": 1.444,
}


def parameters_for_v(v_number: float) -> dict[str, float]:
    index_difference = math.sqrt(
        BASE_PARAMETERS["n_core"] ** 2 - BASE_PARAMETERS["n_cladding"] ** 2
    )
    core_radius_m = v_number * BASE_PARAMETERS["wavelength_m"] / (2.0 * math.pi * index_difference)
    return BASE_PARAMETERS | {"core_radius_m": core_radius_m}


def test_generic_lp01_matches_the_legacy_lp01_solution() -> None:
    parameters = {
        "wavelength_m": 1.625e-6,
        "core_radius_m": 4.1e-6,
        "n_core": 1.4504,
        "n_cladding": 1.4447,
    }

    legacy = solve_scalar_step_index_lp01(**parameters)
    generic = solve_scalar_step_index_lp_mode(
        **parameters,
        azimuthal_order=0,
        radial_order=1,
    )

    assert isinstance(legacy, ScalarLP01ModeSolution)
    assert generic.mode.label == "LP01"
    assert generic.mode.spatial_degeneracy == 1
    assert generic.mode.cutoff_v_dimensionless == 0.0
    assert generic.v_number_dimensionless == pytest.approx(legacy.v_number_dimensionless)
    assert generic.u_dimensionless == pytest.approx(legacy.u_dimensionless, rel=1e-12)
    assert generic.w_dimensionless == pytest.approx(legacy.w_dimensionless, rel=1e-12)
    assert generic.effective_index_dimensionless == pytest.approx(
        legacy.effective_index_dimensionless,
        rel=1e-12,
    )
    assert generic.beta_per_m == pytest.approx(legacy.beta_per_m, rel=1e-12)
    assert generic.kappa_per_m == pytest.approx(legacy.kappa_per_m, rel=1e-12)
    assert generic.gamma_per_m == pytest.approx(legacy.gamma_per_m, rel=1e-12)


def test_supported_mode_catalog_has_exact_cutoff_ordering() -> None:
    modes, truncated = supported_scalar_lp_mode_indices(10.0)

    assert not truncated
    assert [mode.label for mode in modes] == [
        "LP01",
        "LP11",
        "LP02",
        "LP21",
        "LP31",
        "LP12",
        "LP41",
        "LP03",
        "LP22",
        "LP51",
        "LP32",
        "LP13",
        "LP61",
        "LP42",
        "LP71",
    ]
    cutoffs = [mode.cutoff_v_dimensionless for mode in modes]
    assert cutoffs == sorted(cutoffs)
    assert cutoffs[2] == cutoffs[3]
    assert cutoffs[7] == cutoffs[8]
    assert cutoffs == [
        pytest.approx(0.0),
        pytest.approx(2.4048255576957724),
        pytest.approx(3.8317059702075125),
        pytest.approx(3.8317059702075125),
        pytest.approx(5.135622301840683),
        pytest.approx(5.520078110286311),
        pytest.approx(6.380161895923984),
        pytest.approx(7.015586669815619),
        pytest.approx(7.015586669815619),
        pytest.approx(7.588342434503804),
        pytest.approx(8.417244140399866),
        pytest.approx(8.653727912911013),
        pytest.approx(8.771483815959954),
        pytest.approx(9.76102312998167),
        pytest.approx(9.936109524217686),
    ]


def test_lp11_is_supported_only_above_its_exact_cutoff() -> None:
    cutoff = scalar_lp_mode_cutoff_v(1, 1)

    for v_number in (cutoff - 1e-8, cutoff):
        with pytest.raises(ScalarLPModeSolveError):
            solve_scalar_step_index_lp_mode(
                **parameters_for_v(v_number),
                azimuthal_order=1,
                radial_order=1,
            )

    solution = solve_scalar_step_index_lp_mode(
        **parameters_for_v(cutoff + 1e-6),
        azimuthal_order=1,
        radial_order=1,
    )
    assert solution.mode.label == "LP11"
    assert solution.v_number_dimensionless > solution.mode.cutoff_v_dimensionless


@pytest.mark.parametrize(
    "azimuthal_order,radial_order",
    [(0, 1), (1, 1), (0, 2), (2, 1), (1, 2), (3, 1)],
)
def test_guided_solutions_keep_beta_between_cladding_and_core_bounds(
    azimuthal_order: int,
    radial_order: int,
) -> None:
    parameters = parameters_for_v(8.0)
    solution = solve_scalar_step_index_lp_mode(
        **parameters,
        azimuthal_order=azimuthal_order,
        radial_order=radial_order,
    )
    k0_per_m = 2.0 * math.pi / solution.wavelength_m

    assert solution.n_cladding * k0_per_m < solution.beta_per_m
    assert solution.beta_per_m < solution.n_core * k0_per_m
    assert solution.n_cladding < solution.effective_index_dimensionless < solution.n_core
    assert solution.u_dimensionless**2 + solution.w_dimensionless**2 == pytest.approx(
        solution.v_number_dimensionless**2,
        rel=1e-13,
    )
    assert 0.0 < solution.normalized_propagation_constant < 1.0


@pytest.mark.parametrize(
    "azimuthal_order,radial_order",
    [(0, 2), (2, 1), (1, 2), (3, 1)],
)
def test_higher_order_solutions_are_stable_and_repeatable(
    azimuthal_order: int,
    radial_order: int,
) -> None:
    parameters = parameters_for_v(8.0)

    first = solve_scalar_step_index_lp_mode(
        **parameters,
        azimuthal_order=azimuthal_order,
        radial_order=radial_order,
    )
    second = solve_scalar_step_index_lp_mode(
        **parameters,
        azimuthal_order=azimuthal_order,
        radial_order=radial_order,
    )

    assert first == second
    assert first.u_dimensionless > first.mode.cutoff_v_dimensionless
    assert first.w_dimensionless > 0.0
    assert all(
        math.isfinite(value)
        for value in (
            first.v_number_dimensionless,
            first.u_dimensionless,
            first.w_dimensionless,
            first.normalized_propagation_constant,
            first.effective_index_dimensionless,
            first.beta_per_m,
            first.kappa_per_m,
            first.gamma_per_m,
        )
    )


@pytest.mark.parametrize(
    "parameters,azimuthal_order,radial_order",
    [
        (
            {
                "wavelength_m": 0.0,
                "core_radius_m": 4.1e-6,
                "n_core": 1.45,
                "n_cladding": 1.444,
            },
            0,
            1,
        ),
        (
            {
                "wavelength_m": 1.55e-6,
                "core_radius_m": 4.1e-6,
                "n_core": 1.444,
                "n_cladding": 1.45,
            },
            0,
            1,
        ),
        (
            {
                "wavelength_m": 1.55e-6,
                "core_radius_m": 4.1e-6,
                "n_core": 1.45,
                "n_cladding": 1.444,
            },
            -1,
            1,
        ),
        (
            {
                "wavelength_m": 1.55e-6,
                "core_radius_m": 4.1e-6,
                "n_core": 1.45,
                "n_cladding": 1.444,
            },
            0,
            0,
        ),
    ],
)
def test_step_index_solver_rejects_invalid_or_unsupported_mode_inputs(
    parameters: dict[str, float],
    azimuthal_order: int,
    radial_order: int,
) -> None:
    with pytest.raises(ScalarLPModeSolveError):
        solve_scalar_step_index_lp_mode(
            **parameters,
            azimuthal_order=azimuthal_order,
            radial_order=radial_order,
        )
