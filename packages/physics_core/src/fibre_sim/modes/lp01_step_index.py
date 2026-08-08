import math
from dataclasses import dataclass

from scipy.optimize import brentq  # type: ignore[import-untyped]
from scipy.special import jv, kve  # type: ignore[import-untyped]

_FIRST_J0_ZERO = 2.404825557695773


class ScalarLP01SolveError(ValueError):
    pass


@dataclass(frozen=True)
class ScalarLP01ModeSolution:
    wavelength_m: float
    core_radius_m: float
    n_core: float
    n_cladding: float
    v_number_dimensionless: float
    u_dimensionless: float
    w_dimensionless: float
    effective_index_dimensionless: float
    beta_per_m: float
    kappa_per_m: float
    gamma_per_m: float


def _characteristic_residual(u_value: float, v_number: float) -> float:
    w_value = math.sqrt(max(0.0, v_number * v_number - u_value * u_value))
    left = u_value * jv(1, u_value) / jv(0, u_value)
    right = w_value * kve(1, w_value) / kve(0, w_value)
    return float(left - right)


def solve_scalar_step_index_lp01(
    *,
    wavelength_m: float,
    core_radius_m: float,
    n_core: float,
    n_cladding: float,
) -> ScalarLP01ModeSolution:
    values = (wavelength_m, core_radius_m, n_core, n_cladding)
    if any(not math.isfinite(value) for value in values):
        raise ScalarLP01SolveError("LP01 mode inputs must be finite.")
    if wavelength_m <= 0.0 or core_radius_m <= 0.0:
        raise ScalarLP01SolveError("LP01 wavelength and core radius must be positive.")
    if n_core <= n_cladding or n_cladding <= 0.0:
        raise ScalarLP01SolveError(
            "LP01 core index must be greater than the positive cladding index."
        )

    k0_per_m = 2.0 * math.pi / wavelength_m
    v_number = k0_per_m * core_radius_m * math.sqrt(n_core * n_core - n_cladding * n_cladding)
    lower = max(v_number * 1e-12, math.nextafter(0.0, 1.0))
    upper = min(v_number * (1.0 - 1e-12), _FIRST_J0_ZERO * (1.0 - 1e-12))
    if not lower < upper:
        raise ScalarLP01SolveError("LP01 normalized frequency is too small for the root solve.")

    try:
        u_value = float(
            brentq(
                _characteristic_residual,
                lower,
                upper,
                args=(v_number,),
                xtol=5e-15,
                rtol=1e-14,
                maxiter=200,
            )
        )
    except (ValueError, RuntimeError, FloatingPointError) as exc:
        raise ScalarLP01SolveError("The scalar LP01 characteristic root was unavailable.") from exc

    w_value = math.sqrt(v_number * v_number - u_value * u_value)
    kappa_per_m = u_value / core_radius_m
    gamma_per_m = w_value / core_radius_m
    beta_per_m = math.sqrt((n_core * k0_per_m) ** 2 - kappa_per_m * kappa_per_m)
    effective_index = beta_per_m / k0_per_m
    result_values = (
        v_number,
        u_value,
        w_value,
        effective_index,
        beta_per_m,
        kappa_per_m,
        gamma_per_m,
    )
    if any(not math.isfinite(value) or value <= 0.0 for value in result_values):
        raise ScalarLP01SolveError("The scalar LP01 solve produced an invalid result.")
    if not n_cladding * k0_per_m < beta_per_m < n_core * k0_per_m:
        raise ScalarLP01SolveError("The scalar LP01 propagation constant is outside guided bounds.")

    return ScalarLP01ModeSolution(
        wavelength_m=wavelength_m,
        core_radius_m=core_radius_m,
        n_core=n_core,
        n_cladding=n_cladding,
        v_number_dimensionless=v_number,
        u_dimensionless=u_value,
        w_dimensionless=w_value,
        effective_index_dimensionless=effective_index,
        beta_per_m=beta_per_m,
        kappa_per_m=kappa_per_m,
        gamma_per_m=gamma_per_m,
    )
