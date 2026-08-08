import pytest

from fibre_sim.modes import ScalarLP01SolveError, solve_scalar_step_index_lp01


def test_scalar_lp01_solution_satisfies_the_synthetic_fixture() -> None:
    result = solve_scalar_step_index_lp01(
        wavelength_m=1.625e-6,
        core_radius_m=4.1e-6,
        n_core=1.4504,
        n_cladding=1.4447,
    )

    assert result.v_number_dimensionless == pytest.approx(2.0364772942, rel=1e-10)
    assert result.u_dimensionless == pytest.approx(1.5403857891, rel=1e-10)
    assert result.w_dimensionless == pytest.approx(1.3320853541, rel=1e-10)
    assert result.beta_per_m == pytest.approx(5.5954822399e6, rel=1e-10)
    assert result.u_dimensionless**2 + result.w_dimensionless**2 == pytest.approx(
        result.v_number_dimensionless**2
    )


@pytest.mark.parametrize(
    ("wavelength_m", "core_radius_m", "n_core", "n_cladding"),
    [
        (0.0, 4.1e-6, 1.4504, 1.4447),
        (1.55e-6, 0.0, 1.4504, 1.4447),
        (1.55e-6, 4.1e-6, 1.44, 1.45),
    ],
)
def test_invalid_scalar_lp01_inputs_are_rejected(
    wavelength_m: float,
    core_radius_m: float,
    n_core: float,
    n_cladding: float,
) -> None:
    with pytest.raises(ScalarLP01SolveError):
        solve_scalar_step_index_lp01(
            wavelength_m=wavelength_m,
            core_radius_m=core_radius_m,
            n_core=n_core,
            n_cladding=n_cladding,
        )
