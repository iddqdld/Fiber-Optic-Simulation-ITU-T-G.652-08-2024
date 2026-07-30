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
_RawPoint = tuple[float, float, float, float, float]
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
    s = 0.0
    t = 0.0
    saps = (request.geometry.sap_1, request.geometry.sap_2)
    for sap, mismatch_strain in zip(saps, mismatch_strains, strict=True):
        dx_m = x_m - sap.center_x_m
        dy_m = y_m - sap.center_y_m
        distance_m = math.hypot(dx_m, dy_m)
        radial_ratio = sap.radius_m / distance_m
        q_i = mismatch_strain * radial_ratio * radial_ratio
        direction_x = dx_m / distance_m
        direction_y = dy_m / distance_m
        s += q_i * (direction_x * direction_x - direction_y * direction_y)
        t += q_i * (2.0 * direction_x * direction_y)

    raw_deviatoric_difference = 2.0 * s
    raw_shear = t
    raw_principal_difference = 2.0 * math.hypot(s, t)
    return raw_deviatoric_difference, raw_shear, raw_principal_difference, s, t


def _warnings(request: PandaFieldMapRequest) -> tuple[PandaFieldMapWarning, ...]:
    warnings = [
        PandaFieldMapWarning(
            code=PandaFieldMapWarningCode.QUALITATIVE_UNCALIBRATED,
            message=(
                "K_i is undefined and omitted; outputs are normalized qualitative kernels only."
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
    raw_rows: list[list[_RawPoint | None]] = []
    valid_point_count = 0
    kernel_scale = 0.0

    for y_m in y_coordinates_m:
        validity_row: list[bool] = []
        raw_row: list[_RawPoint | None] = []
        for x_m in x_coordinates_m:
            valid = _is_valid_point(request, x_m, y_m)
            validity_row.append(valid)
            if not valid:
                raw_row.append(None)
                continue

            raw = _raw_point(request, mismatch_strains, x_m, y_m)
            raw_row.append(raw)
            valid_point_count += 1
            principal_difference = raw[2]
            if not math.isfinite(principal_difference):
                raise PandaFieldMapCalculationError()
            kernel_scale = max(kernel_scale, principal_difference)
        validity_rows.append(validity_row)
        raw_rows.append(raw_row)

    if valid_point_count == 0 or not math.isfinite(kernel_scale) or kernel_scale <= 0.0:
        raise PandaFieldMapCalculationError()

    deviatoric_rows: list[list[float | None]] = []
    shear_rows: list[list[float | None]] = []
    principal_rows: list[list[float | None]] = []
    angle_rows: list[list[float | None]] = []
    for raw_row in raw_rows:
        deviatoric_row: list[float | None] = []
        shear_row: list[float | None] = []
        principal_row: list[float | None] = []
        angle_row: list[float | None] = []
        for raw_cell in raw_row:
            if raw_cell is None:
                deviatoric_row.append(None)
                shear_row.append(None)
                principal_row.append(None)
                angle_row.append(None)
                continue

            raw_deviatoric, raw_shear, raw_principal, s, t = raw_cell
            normalized_deviatoric = raw_deviatoric / kernel_scale
            normalized_shear = raw_shear / kernel_scale
            normalized_principal = raw_principal / kernel_scale
            principal_axis = (
                None if normalized_principal <= _ANGLE_ZERO_TOLERANCE else 0.5 * math.atan2(t, s)
            )
            deviatoric_row.append(normalized_deviatoric)
            shear_row.append(normalized_shear)
            principal_row.append(normalized_principal)
            angle_row.append(principal_axis)
        deviatoric_rows.append(deviatoric_row)
        shear_rows.append(shear_row)
        principal_rows.append(principal_row)
        angle_rows.append(angle_row)

    validity = PandaFieldMapValidity(
        interface_buffer_m=request.sampling.interface_buffer_m,
        valid_point_count=valid_point_count,
    )
    return PandaFieldMapResult(
        configuration=request,
        x_coordinates_m=x_coordinates_m,
        y_coordinates_m=y_coordinates_m,
        validity_mask=tuple(tuple(row) for row in validity_rows),
        normalized_deviatoric_difference_kernel=tuple(tuple(row) for row in deviatoric_rows),
        normalized_shear_kernel=tuple(tuple(row) for row in shear_rows),
        normalized_principal_difference_kernel=tuple(tuple(row) for row in principal_rows),
        principal_axis_angle_rad=tuple(tuple(row) for row in angle_rows),
        sap_thermal_mismatch_strains=mismatch_strains,
        kernel_scale=kernel_scale,
        warnings=_warnings(request),
        model_manifest=PandaFieldMapManifest(validity=validity),
    )


__all__ = ["PandaFieldMapCalculationError", "calculate_panda_field_map"]
