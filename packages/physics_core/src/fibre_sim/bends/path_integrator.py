import math
from collections.abc import Sequence

from .calculations import calculate_marcuse_bend_loss
from .request import MarcuseBendLossInput
from .result import BendPathLossResult, MarcuseModelValidity

Point3D = tuple[float, float, float]


class BendPathIntegrationError(ValueError):
    pass


def _subtract(left: Point3D, right: Point3D) -> Point3D:
    return (left[0] - right[0], left[1] - right[1], left[2] - right[2])


def _norm(value: Point3D) -> float:
    return math.sqrt(value[0] ** 2 + value[1] ** 2 + value[2] ** 2)


def _cross(left: Point3D, right: Point3D) -> Point3D:
    return (
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    )


def _point_curvature(previous: Point3D, current: Point3D, following: Point3D) -> float:
    first = _subtract(current, previous)
    second = _subtract(following, current)
    chord = _subtract(following, previous)
    first_length = _norm(first)
    second_length = _norm(second)
    chord_length = _norm(chord)
    if first_length == 0.0 or second_length == 0.0 or chord_length == 0.0:
        raise BendPathIntegrationError("Path samples must be distinct and ordered.")
    cross_norm = _norm(_cross(first, second))
    if cross_norm / (first_length * second_length) <= 1e-12:
        return 0.0
    return 2.0 * cross_norm / (first_length * second_length * chord_length)


def integrate_local_curvature_marcuse(
    points_m: Sequence[Point3D],
    *,
    wavelength_m: float,
    core_radius_m: float,
    cladding_radius_m: float | None,
    n_core: float,
    n_cladding: float,
    beta_per_m: float,
) -> BendPathLossResult:
    if len(points_m) < 3:
        raise BendPathIntegrationError("A path integration requires at least three samples.")
    if any(
        len(point) != 3 or any(not math.isfinite(coordinate) for coordinate in point)
        for point in points_m
    ):
        raise BendPathIntegrationError("Path samples must contain three finite SI coordinates.")

    segment_lengths = [
        _norm(_subtract(points_m[index + 1], points_m[index])) for index in range(len(points_m) - 1)
    ]
    if any(length <= 0.0 for length in segment_lengths):
        raise BendPathIntegrationError("Path samples must be distinct and ordered.")

    interior_curvatures = [
        _point_curvature(points_m[index - 1], points_m[index], points_m[index + 1])
        for index in range(1, len(points_m) - 1)
    ]
    curvatures = [interior_curvatures[0], *interior_curvatures, interior_curvatures[-1]]
    sampled_length_m = sum(segment_lengths)
    if all(curvature == 0.0 for curvature in curvatures):
        return BendPathLossResult(
            total_loss_db=0.0,
            sampled_length_m=sampled_length_m,
            minimum_bend_radius_m=None,
            max_local_loss_db_per_m=0.0,
            sample_count=len(points_m),
            validity=MarcuseModelValidity.VALID,
            numerical_underflow=False,
            warnings=(),
        )

    local_loss_db_per_m: list[float] = []
    validity = MarcuseModelValidity.VALID
    underflow = False
    warnings: list[str] = [
        "Local-curvature Marcuse estimate. Curvature transitions can add unmodeled mode mismatch."
    ]
    finite_radii: list[float] = []
    validity_rank = {
        MarcuseModelValidity.VALID: 0,
        MarcuseModelValidity.WARNING: 1,
        MarcuseModelValidity.OUTSIDE_MODEL_VALIDITY: 2,
    }
    for curvature in curvatures:
        if curvature == 0.0:
            local_loss_db_per_m.append(0.0)
            continue
        radius_m = 1.0 / curvature
        finite_radii.append(radius_m)
        local = calculate_marcuse_bend_loss(
            MarcuseBendLossInput(
                wavelength_m=wavelength_m,
                core_radius_m=core_radius_m,
                cladding_radius_m=cladding_radius_m,
                n_core=n_core,
                n_cladding=n_cladding,
                beta_per_m=beta_per_m,
                bend_radius_m=radius_m,
            )
        )
        local_loss_db_per_m.append(local.loss_db_per_m)
        if validity_rank[local.validity] > validity_rank[validity]:
            validity = local.validity
        underflow = underflow or local.numerical_underflow
        for warning in local.warnings:
            if warning not in warnings:
                warnings.append(warning)

    total_loss_db = sum(
        0.5 * (local_loss_db_per_m[index] + local_loss_db_per_m[index + 1]) * segment_length
        for index, segment_length in enumerate(segment_lengths)
    )
    if not math.isfinite(total_loss_db):
        raise BendPathIntegrationError("The local-curvature path integral is non-finite.")

    return BendPathLossResult(
        total_loss_db=total_loss_db,
        sampled_length_m=sampled_length_m,
        minimum_bend_radius_m=min(finite_radii),
        max_local_loss_db_per_m=max(local_loss_db_per_m),
        sample_count=len(points_m),
        validity=validity,
        numerical_underflow=underflow,
        warnings=tuple(warnings),
    )


def add_path_convergence_error(
    coarse: BendPathLossResult,
    fine: BendPathLossResult,
) -> BendPathLossResult:
    if fine.sample_count <= coarse.sample_count:
        raise BendPathIntegrationError("The fine path result must use more samples.")
    return fine.model_copy(
        update={"convergence_error_db": abs(fine.total_loss_db - coarse.total_loss_db)}
    )
