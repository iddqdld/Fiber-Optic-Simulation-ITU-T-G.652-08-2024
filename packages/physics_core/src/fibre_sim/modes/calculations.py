import math

from .request import GaussianModeProfileRequest
from .result import GaussianModeProfileManifest, GaussianModeProfileResult


def _build_axis(half_width: float, grid_points: int) -> tuple[float, ...]:
    half_points = grid_points // 2
    spacing = half_width / half_points
    positive = [spacing * index for index in range(1, half_points + 1)]
    positive[-1] = half_width
    return tuple(-coordinate for coordinate in reversed(positive)) + (0.0,) + tuple(positive)


def _normalized_field(x: float, y: float, mode_field_radius: float) -> float:
    radius = math.hypot(x / mode_field_radius, y / mode_field_radius)
    return math.exp(-(radius * radius))


def calculate_gaussian_mode_profile(
    request: GaussianModeProfileRequest,
) -> GaussianModeProfileResult:
    axis = _build_axis(request.grid_half_width_um, request.grid_points)
    normalized_field = tuple(
        tuple(_normalized_field(x, y, request.mode_field_radius_um) for x in axis) for y in axis
    )
    normalized_intensity = tuple(tuple(field * field for field in row) for row in normalized_field)
    return GaussianModeProfileResult(
        mode_field_radius_um=request.mode_field_radius_um,
        grid_half_width_um=request.grid_half_width_um,
        grid_points=request.grid_points,
        x_um=axis,
        y_um=axis,
        normalized_field=normalized_field,
        normalized_intensity=normalized_intensity,
        model_manifest=GaussianModeProfileManifest(),
    )
