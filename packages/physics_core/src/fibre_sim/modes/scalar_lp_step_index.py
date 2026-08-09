import math
from dataclasses import dataclass
from functools import cache
from typing import Literal

from scipy.optimize import brentq  # type: ignore[import-untyped]
from scipy.special import jn_zeros, jv, jvp, kve  # type: ignore[import-untyped]

MAX_SCALAR_LP_MODE_FAMILIES = 16
_MAX_ANGULAR_ORDER = 64
_MAX_RADIAL_ORDER = 64


class ScalarLPModeSolveError(ValueError):
    pass


@dataclass(frozen=True)
class ScalarLPModeIndex:
    azimuthal_order: int
    radial_order: int
    cutoff_v_dimensionless: float

    @property
    def label(self) -> str:
        return f"LP{self.azimuthal_order}{self.radial_order}"

    @property
    def spatial_degeneracy(self) -> Literal[1, 2]:
        return 1 if self.azimuthal_order == 0 else 2


@dataclass(frozen=True)
class ScalarLPModeSolution:
    wavelength_m: float
    core_radius_m: float
    n_core: float
    n_cladding: float
    mode: ScalarLPModeIndex
    v_number_dimensionless: float
    u_dimensionless: float
    w_dimensionless: float
    normalized_propagation_constant: float
    effective_index_dimensionless: float
    beta_per_m: float
    kappa_per_m: float
    gamma_per_m: float


@cache
def _bessel_zero(order: int, radial_index: int) -> float:
    return float(jn_zeros(order, radial_index)[-1])


def scalar_lp_mode_cutoff_v(azimuthal_order: int, radial_order: int) -> float:
    if azimuthal_order < 0 or radial_order < 1:
        raise ScalarLPModeSolveError("LP mode orders are outside their valid ranges.")
    if azimuthal_order == 0:
        return 0.0 if radial_order == 1 else _bessel_zero(1, radial_order - 1)
    return _bessel_zero(azimuthal_order - 1, radial_order)


def _mode_upper_u(azimuthal_order: int, radial_order: int) -> float:
    return _bessel_zero(azimuthal_order, radial_order)


def _characteristic_residual(
    u_value: float,
    v_number: float,
    azimuthal_order: int,
) -> float:
    w_squared = v_number * v_number - u_value * u_value
    w_value = math.sqrt(max(0.0, w_squared))
    core_value = float(jv(azimuthal_order, u_value))
    if core_value == 0.0:
        return math.nan
    left = u_value * float(jvp(azimuthal_order, u_value, 1)) / core_value
    if w_value == 0.0:
        right = -float(azimuthal_order)
    else:
        previous_order = 1 if azimuthal_order == 0 else azimuthal_order - 1
        denominator = float(kve(azimuthal_order, w_value))
        numerator = float(kve(previous_order, w_value))
        right = -w_value * numerator / denominator - azimuthal_order
    return left - right


def _find_root_bracket(
    lower: float,
    upper: float,
    v_number: float,
    azimuthal_order: int,
) -> tuple[float, float]:
    sample_count = 257
    previous_u = lower
    previous_value = _characteristic_residual(
        previous_u,
        v_number,
        azimuthal_order,
    )
    for sample_index in range(1, sample_count):
        fraction = sample_index / (sample_count - 1)
        current_u = lower + (upper - lower) * fraction
        current_value = _characteristic_residual(
            current_u,
            v_number,
            azimuthal_order,
        )
        if math.isfinite(previous_value) and math.isfinite(current_value):
            if previous_value == 0.0:
                return previous_u, previous_u
            if current_value == 0.0 or previous_value * current_value < 0.0:
                return previous_u, current_u
        previous_u = current_u
        previous_value = current_value
    raise ScalarLPModeSolveError("The scalar LP mode root bracket was unavailable.")


def solve_scalar_step_index_lp_mode(
    *,
    wavelength_m: float,
    core_radius_m: float,
    n_core: float,
    n_cladding: float,
    azimuthal_order: int,
    radial_order: int,
) -> ScalarLPModeSolution:
    values = (wavelength_m, core_radius_m, n_core, n_cladding)
    if any(not math.isfinite(value) for value in values):
        raise ScalarLPModeSolveError("Scalar LP mode inputs must be finite.")
    if wavelength_m <= 0.0 or core_radius_m <= 0.0:
        raise ScalarLPModeSolveError("Wavelength and core radius must be positive.")
    if n_core <= n_cladding or n_cladding <= 0.0:
        raise ScalarLPModeSolveError("Core index must be greater than the positive cladding index.")

    cutoff_v = scalar_lp_mode_cutoff_v(azimuthal_order, radial_order)
    k0_per_m = 2.0 * math.pi / wavelength_m
    v_number = k0_per_m * core_radius_m * math.sqrt(n_core**2 - n_cladding**2)
    if v_number <= cutoff_v:
        raise ScalarLPModeSolveError(
            f"LP{azimuthal_order}{radial_order} is not guided at the supplied V-number."
        )

    lower_bound = cutoff_v
    upper_bound = min(v_number, _mode_upper_u(azimuthal_order, radial_order))
    lower = math.nextafter(lower_bound, math.inf)
    upper = math.nextafter(upper_bound, -math.inf)
    if not lower < upper:
        raise ScalarLPModeSolveError("The scalar LP mode root interval is empty.")

    bracket_lower, bracket_upper = _find_root_bracket(
        lower,
        upper,
        v_number,
        azimuthal_order,
    )
    if bracket_lower == bracket_upper:
        u_value = bracket_lower
    else:
        try:
            u_value = float(
                brentq(
                    _characteristic_residual,
                    bracket_lower,
                    bracket_upper,
                    args=(v_number, azimuthal_order),
                    xtol=5e-15,
                    rtol=1e-14,
                    maxiter=200,
                )
            )
        except (ValueError, RuntimeError, FloatingPointError) as exc:
            raise ScalarLPModeSolveError(
                "The scalar LP characteristic root was unavailable."
            ) from exc

    w_value = math.sqrt(v_number * v_number - u_value * u_value)
    kappa_per_m = u_value / core_radius_m
    gamma_per_m = w_value / core_radius_m
    beta_per_m = math.sqrt((n_core * k0_per_m) ** 2 - kappa_per_m**2)
    effective_index = beta_per_m / k0_per_m
    normalized_propagation_constant = (w_value / v_number) ** 2
    result_values = (
        v_number,
        u_value,
        w_value,
        normalized_propagation_constant,
        effective_index,
        beta_per_m,
        kappa_per_m,
        gamma_per_m,
    )
    if any(not math.isfinite(value) or value <= 0.0 for value in result_values):
        raise ScalarLPModeSolveError("The scalar LP mode solve produced an invalid result.")
    if not n_cladding * k0_per_m < beta_per_m < n_core * k0_per_m:
        raise ScalarLPModeSolveError("The scalar LP propagation constant is outside guided bounds.")

    return ScalarLPModeSolution(
        wavelength_m=wavelength_m,
        core_radius_m=core_radius_m,
        n_core=n_core,
        n_cladding=n_cladding,
        mode=ScalarLPModeIndex(
            azimuthal_order=azimuthal_order,
            radial_order=radial_order,
            cutoff_v_dimensionless=cutoff_v,
        ),
        v_number_dimensionless=v_number,
        u_dimensionless=u_value,
        w_dimensionless=w_value,
        normalized_propagation_constant=normalized_propagation_constant,
        effective_index_dimensionless=effective_index,
        beta_per_m=beta_per_m,
        kappa_per_m=kappa_per_m,
        gamma_per_m=gamma_per_m,
    )


def supported_scalar_lp_mode_indices(
    v_number: float,
    max_families: int = MAX_SCALAR_LP_MODE_FAMILIES,
) -> tuple[tuple[ScalarLPModeIndex, ...], bool]:
    if not math.isfinite(v_number) or v_number <= 0.0:
        raise ScalarLPModeSolveError("The V-number must be finite and positive.")
    if max_families < 1 or max_families > MAX_SCALAR_LP_MODE_FAMILIES:
        raise ScalarLPModeSolveError("The mode-family limit is outside its valid range.")

    candidates = [ScalarLPModeIndex(0, 1, 0.0)]
    truncated_by_search_limit = False
    for azimuthal_order in range(_MAX_ANGULAR_ORDER + 1):
        first_radial_order = 2 if azimuthal_order == 0 else 1
        for radial_order in range(first_radial_order, _MAX_RADIAL_ORDER + 1):
            cutoff_v = scalar_lp_mode_cutoff_v(azimuthal_order, radial_order)
            if cutoff_v >= v_number:
                break
            candidates.append(
                ScalarLPModeIndex(
                    azimuthal_order=azimuthal_order,
                    radial_order=radial_order,
                    cutoff_v_dimensionless=cutoff_v,
                )
            )
        else:
            truncated_by_search_limit = True

        if azimuthal_order > 0:
            next_cutoff = scalar_lp_mode_cutoff_v(azimuthal_order, 1)
            if next_cutoff >= v_number:
                break
    else:
        truncated_by_search_limit = True

    candidates.sort(
        key=lambda mode: (
            mode.cutoff_v_dimensionless,
            mode.azimuthal_order,
            mode.radial_order,
        )
    )
    truncated = truncated_by_search_limit or len(candidates) > max_families
    return tuple(candidates[:max_families]), truncated
