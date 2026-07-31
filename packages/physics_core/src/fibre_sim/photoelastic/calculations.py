import math
from typing import Literal

from .request import PandaFieldMapRequest
from .result import (
    PandaFieldMapManifest,
    PandaFieldMapResult,
    PandaFieldMapValidity,
    PandaFieldMapWarning,
    PandaFieldMapWarningCode,
)

_NormalizationUnavailable = Literal["normalization_unavailable"]
_RawPoint = tuple[float, float, float]
_ANGLE_ZERO_TOLERANCE = 1.0e-12


class PandaFieldMapCalculationError(ValueError):
    def __init__(
        self,
        reason: _NormalizationUnavailable = "normalization_unavailable",
    ) -> None:
        self.reason = reason
        super().__init__(
            "PANDA qualitative field-map normalization is unavailable because "
            "the valid kernel has no finite nonzero scale."
        )


def _coordinates(half_width_m: float, grid_points: int) -> tuple[float, ...]:
    midpoint = (grid_points - 1) // 2
    return tuple(half_width_m * ((index - midpoint) / midpoint) for index in range(grid_points))


def _thermal_mismatch_strains(request: PandaFieldMapRequest) -> tuple[float, float]:
    temperature_interval_k = (
        request.thermal.effective_fictive_temperature_k - request.thermal.temperature_k
    )
    cladding_cte = request.materials.cladding.cte_per_k
    return (
        (request.materials.sap_1.cte_per_k - cladding_cte) * temperature_interval_k,
        (request.materials.sap_2.cte_per_k - cladding_cte) * temperature_interval_k,
    )


def _is_valid_point(request: PandaFieldMapRequest, x_m: float, y_m: float) -> bool:
    if math.hypot(x_m, y_m) > request.geometry.cladding_radius_m:
        return False

    interface_buffer_m = request.sampling.interface_buffer_m
    for sap in (request.geometry.sap_1, request.geometry.sap_2):
        distance_m = math.hypot(x_m - sap.center_x_m, y_m - sap.center_y_m)
        if distance_m <= sap.radius_m + interface_buffer_m:
            return False
    return True


def _raw_point(
    request: PandaFieldMapRequest,
    mismatch_strains: tuple[float, float],
    x_m: float,
    y_m: float,
) -> _RawPoint:
    raw_deviatoric_difference = 0.0
    raw_shear = 0.0
    saps = (request.geometry.sap_1, request.geometry.sap_2)
    for sap, relative_amplitude in zip(saps, mismatch_strains, strict=True):
        dx_m = x_m - sap.center_x_m
        dy_m = y_m - sap.center_y_m
        r2_m2 = dx_m * dx_m + dy_m * dy_m
        if r2_m2 == 0.0:
            continue

        contribution = 2.0 * relative_amplitude * sap.radius_m * sap.radius_m / (r2_m2 * r2_m2)
        raw_deviatoric_difference += contribution * (dx_m * dx_m - dy_m * dy_m)
        raw_shear += contribution * dx_m * dy_m

    s = 0.5 * raw_deviatoric_difference
    t = raw_shear
    return raw_deviatoric_difference, s, t


def _warnings(request: PandaFieldMapRequest) -> tuple[PandaFieldMapWarning, ...]:
    warnings = [
        PandaFieldMapWarning(
            code=PandaFieldMapWarningCode.QUALITATIVE_UNCALIBRATED,
            message=(
                "K_i is undefined and omitted; the deviatoric field output is a normalized "
                "qualitative kernel only."
            ),
            output_field="normalized_deviatoric_difference_kernel",
        ),
        PandaFieldMapWarning(
            code=PandaFieldMapWarningCode.FINITE_CLADDING_APPROXIMATION,
            message="The far-field kernel does not solve the finite cladding boundary.",
            output_field="normalized_deviatoric_difference_kernel",
        ),
    ]
    if request.sampling.interface_buffer_m == 0.0:
        warnings.append(
            PandaFieldMapWarning(
                code=PandaFieldMapWarningCode.ZERO_INTERFACE_BUFFER,
                message=("No interface buffer is configured around the masked SAP interiors."),
                output_field="validity_mask",
            )
        )
    return tuple(warnings)


def calculate_panda_field_map(request: PandaFieldMapRequest) -> PandaFieldMapResult:
    x_coordinates_m = _coordinates(
        request.sampling.grid_half_width_m,
        request.sampling.grid_points,
    )
    y_coordinates_m = x_coordinates_m
    mismatch_strains = _thermal_mismatch_strains(request)
    if not all(math.isfinite(value) for value in mismatch_strains):
        raise PandaFieldMapCalculationError()

    validity_rows: list[list[bool]] = []
    raw_deviatoric_rows: list[list[float | None]] = []
    valid_point_count = 0
    kernel_scale = 0.0
    nearest_core_distance_squared = math.inf
    core_s: float | None = None
    core_t: float | None = None
    core_principal_difference: float | None = None

    for y_m in y_coordinates_m:
        validity_row: list[bool] = []
        raw_deviatoric_row: list[float | None] = []
        for x_m in x_coordinates_m:
            raw_deviatoric, s, t = _raw_point(request, mismatch_strains, x_m, y_m)
            valid = _is_valid_point(request, x_m, y_m)
            validity_row.append(valid)
            raw_deviatoric_row.append(raw_deviatoric if valid else None)
            if valid:
                valid_point_count += 1
                raw_principal = 2.0 * math.hypot(s, t)
                if not all(math.isfinite(value) for value in (raw_deviatoric, s, t, raw_principal)):
                    raise PandaFieldMapCalculationError()
                kernel_scale = max(kernel_scale, abs(raw_deviatoric))
                core_distance_squared = (x_m - request.geometry.core_center_x_m) ** 2 + (
                    y_m - request.geometry.core_center_y_m
                ) ** 2
                if core_distance_squared < nearest_core_distance_squared:
                    nearest_core_distance_squared = core_distance_squared
                    core_s = s
                    core_t = t
                    core_principal_difference = raw_principal
        validity_rows.append(validity_row)
        raw_deviatoric_rows.append(raw_deviatoric_row)

    if valid_point_count == 0 or not math.isfinite(kernel_scale) or kernel_scale <= 0.0:
        raise PandaFieldMapCalculationError()

    for raw_row in raw_deviatoric_rows:
        for column_index, raw_value in enumerate(raw_row):
            if raw_value is not None:
                raw_row[column_index] = raw_value / kernel_scale

    core_axis_angle = None
    if (
        core_principal_difference is not None
        and core_s is not None
        and core_t is not None
        and core_principal_difference > _ANGLE_ZERO_TOLERANCE
    ):
        core_axis_angle = 0.5 * math.atan2(core_t, core_s)

    validity = PandaFieldMapValidity(
        interface_buffer_m=request.sampling.interface_buffer_m,
        valid_point_count=valid_point_count,
    )
    return PandaFieldMapResult(
        configuration=request,
        x_coordinates_m=x_coordinates_m,
        y_coordinates_m=y_coordinates_m,
        validity_mask=tuple(tuple(row) for row in validity_rows),
        normalized_deviatoric_difference_kernel=tuple(tuple(row) for row in raw_deviatoric_rows),
        sap_thermal_mismatch_strains=mismatch_strains,
        kernel_scale=kernel_scale,
        core_principal_axis_angle_rad=core_axis_angle,
        warnings=_warnings(request),
        model_manifest=PandaFieldMapManifest(validity=validity),
    )


__all__ = ["PandaFieldMapCalculationError", "calculate_panda_field_map"]
