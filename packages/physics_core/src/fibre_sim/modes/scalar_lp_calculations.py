import math

from scipy.special import jv, kve  # type: ignore[import-untyped]

from .scalar_lp_request import ScalarLPModeCatalogRequest, ScalarLPModeFieldRequest
from .scalar_lp_result import (
    ScalarLPModeCatalogResult,
    ScalarLPModeFamilyResult,
    ScalarLPModeFieldResult,
    ScalarLPModeManifest,
)
from .scalar_lp_step_index import (
    ScalarLPModeSolution,
    ScalarLPModeSolveError,
    solve_scalar_step_index_lp_mode,
    supported_scalar_lp_mode_indices,
)


class ScalarLPModeCalculationError(ValueError):
    pass


def _to_family_result(solution: ScalarLPModeSolution) -> ScalarLPModeFamilyResult:
    return ScalarLPModeFamilyResult(
        label=solution.mode.label,
        azimuthal_order=solution.mode.azimuthal_order,
        radial_order=solution.mode.radial_order,
        spatial_degeneracy=solution.mode.spatial_degeneracy,
        cutoff_v_dimensionless=solution.mode.cutoff_v_dimensionless,
        v_number_dimensionless=solution.v_number_dimensionless,
        u_dimensionless=solution.u_dimensionless,
        w_dimensionless=solution.w_dimensionless,
        normalized_propagation_constant=solution.normalized_propagation_constant,
        effective_index_dimensionless=solution.effective_index_dimensionless,
        beta_per_m=solution.beta_per_m,
    )


def _solve_request_mode(
    *,
    wavelength_m: float,
    core_radius_m: float,
    n_core: float,
    n_cladding: float,
    azimuthal_order: int,
    radial_order: int,
) -> ScalarLPModeSolution:
    try:
        return solve_scalar_step_index_lp_mode(
            wavelength_m=wavelength_m,
            core_radius_m=core_radius_m,
            n_core=n_core,
            n_cladding=n_cladding,
            azimuthal_order=azimuthal_order,
            radial_order=radial_order,
        )
    except ScalarLPModeSolveError as exc:
        raise ScalarLPModeCalculationError(str(exc)) from exc


def calculate_scalar_lp_mode_catalog(
    request: ScalarLPModeCatalogRequest,
) -> ScalarLPModeCatalogResult:
    k0_per_m = 2.0 * math.pi / request.wavelength_m
    v_number = (
        k0_per_m * request.core_radius_m * math.sqrt(request.n_core**2 - request.n_cladding**2)
    )
    try:
        indices, truncated = supported_scalar_lp_mode_indices(
            v_number,
            request.max_mode_families,
        )
    except ScalarLPModeSolveError as exc:
        raise ScalarLPModeCalculationError(str(exc)) from exc

    families = tuple(
        _to_family_result(
            _solve_request_mode(
                wavelength_m=request.wavelength_m,
                core_radius_m=request.core_radius_m,
                n_core=request.n_core,
                n_cladding=request.n_cladding,
                azimuthal_order=mode.azimuthal_order,
                radial_order=mode.radial_order,
            )
        )
        for mode in indices
    )
    warnings: list[str] = []
    if truncated:
        warnings.append(
            "The supported-mode catalog is truncated to the first "
            f"{request.max_mode_families} mode families."
        )
    relative_index_difference = (request.n_core - request.n_cladding) / request.n_core
    if relative_index_difference > 0.02:
        warnings.append(
            "The relative index difference is more than 0.02. "
            "The weak-guidance approximation is reduced."
        )

    return ScalarLPModeCatalogResult(
        wavelength_m=request.wavelength_m,
        core_radius_m=request.core_radius_m,
        n_core=request.n_core,
        n_cladding=request.n_cladding,
        v_number_dimensionless=v_number,
        mode_regime="single_mode" if len(families) == 1 and not truncated else "multimode",
        mode_families=families,
        catalog_truncated=truncated,
        warnings=tuple(warnings),
        model_manifest=ScalarLPModeManifest(),
    )


def _build_axis(half_width_m: float, grid_points: int) -> tuple[float, ...]:
    half_points = grid_points // 2
    spacing = half_width_m / half_points
    positive = [spacing * index for index in range(1, half_points + 1)]
    positive[-1] = half_width_m
    return tuple(-coordinate for coordinate in reversed(positive)) + (0.0,) + tuple(positive)


def _radial_field(solution: ScalarLPModeSolution, radius_m: float) -> float:
    order = solution.mode.azimuthal_order
    if radius_m <= solution.core_radius_m:
        boundary_value = float(jv(order, solution.u_dimensionless))
        argument = solution.u_dimensionless * radius_m / solution.core_radius_m
        return float(jv(order, argument)) / boundary_value

    boundary_argument = solution.w_dimensionless
    argument = boundary_argument * radius_m / solution.core_radius_m
    scaled_ratio = float(kve(order, argument)) / float(kve(order, boundary_argument))
    return scaled_ratio * math.exp(boundary_argument - argument)


def calculate_scalar_lp_mode_field(
    request: ScalarLPModeFieldRequest,
) -> ScalarLPModeFieldResult:
    solution = _solve_request_mode(
        wavelength_m=request.wavelength_m,
        core_radius_m=request.core_radius_m,
        n_core=request.n_core,
        n_cladding=request.n_cladding,
        azimuthal_order=request.azimuthal_order,
        radial_order=request.radial_order,
    )
    axis = _build_axis(request.grid_half_width_m, request.grid_points)
    raw_field = tuple(
        tuple(
            _radial_field(solution, math.hypot(x_m, y_m))
            * math.cos(solution.mode.azimuthal_order * math.atan2(y_m, x_m))
            for x_m in axis
        )
        for y_m in axis
    )
    scale = max(abs(value) for row in raw_field for value in row)
    if not math.isfinite(scale) or scale == 0.0:
        raise ScalarLPModeCalculationError("The scalar LP mode field cannot be normalized.")
    normalized_field = tuple(tuple(value / scale for value in row) for row in raw_field)
    normalized_intensity = tuple(tuple(value * value for value in row) for row in normalized_field)
    return ScalarLPModeFieldResult(
        wavelength_m=request.wavelength_m,
        core_radius_m=request.core_radius_m,
        n_core=request.n_core,
        n_cladding=request.n_cladding,
        selected_mode=_to_family_result(solution),
        grid_half_width_m=request.grid_half_width_m,
        grid_points=request.grid_points,
        x_m=axis,
        y_m=axis,
        normalized_field=normalized_field,
        normalized_intensity=normalized_intensity,
        model_manifest=ScalarLPModeManifest(),
    )
