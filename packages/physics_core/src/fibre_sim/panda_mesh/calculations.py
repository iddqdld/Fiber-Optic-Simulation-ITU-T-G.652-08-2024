import importlib
import math
from collections.abc import Iterable
from functools import lru_cache
from typing import Any

from fibre_sim.photoelastic.geometry import PandaGeometry

from .request import PandaMeshRegion, PandaMeshRequest
from .result import (
    PandaMeshGenerationError,
    PandaMeshManifest,
    PandaMeshQuality,
    PandaMeshRegionSummary,
    PandaMeshResult,
    PandaMeshWarning,
    PandaMeshWarningCode,
)

_REGION_ATTRIBUTE = {
    PandaMeshRegion.CORE: 1,
    PandaMeshRegion.SAP_1: 2,
    PandaMeshRegion.SAP_2: 3,
    PandaMeshRegion.CLADDING: 4,
}
_ATTRIBUTE_REGION = {value: key for key, value in _REGION_ATTRIBUTE.items()}
_CIRCLE_POINTS_BY_LEVEL = (32, 64, 128)
_QUALITY_TARGET_DEG = 20.0
_TOUCHING_RELATIVE_TOLERANCE = 1.0e-12
_TOUCHING_ABSOLUTE_TOLERANCE_M = 1.0e-15


@lru_cache(maxsize=1)
def _triangle_module() -> Any:
    return importlib.import_module("triangle")


def _circle_points(
    center_x: float, center_y: float, radius: float, count: int
) -> list[tuple[float, float]]:
    return [
        (
            center_x + radius * math.cos(2.0 * math.pi * index / count),
            center_y + radius * math.sin(2.0 * math.pi * index / count),
        )
        for index in range(count)
    ]


def _touching(left_center_distance: float, left_radius: float, right_radius: float) -> bool:
    return math.isclose(
        left_center_distance,
        left_radius + right_radius,
        rel_tol=_TOUCHING_RELATIVE_TOLERANCE,
        abs_tol=_TOUCHING_ABSOLUTE_TOLERANCE_M,
    )


def _internally_touching(
    center_distance: float, inclusion_radius: float, container_radius: float
) -> bool:
    return math.isclose(
        center_distance + inclusion_radius,
        container_radius,
        rel_tol=_TOUCHING_RELATIVE_TOLERANCE,
        abs_tol=_TOUCHING_ABSOLUTE_TOLERANCE_M,
    )


def _validate_non_tangent_geometry(geometry: PandaGeometry) -> None:
    core = (geometry.core_center_x_m, geometry.core_center_y_m, geometry.core_radius_m)
    core_cladding_distance = math.hypot(core[0], core[1])
    if _internally_touching(core_cladding_distance, core[2], geometry.cladding_radius_m):
        raise PandaMeshGenerationError(
            "touching_interfaces",
            "Core touches the cladding boundary and cannot form a mesh interface.",
        )
    saps = (
        (geometry.sap_1.center_x_m, geometry.sap_1.center_y_m, geometry.sap_1.radius_m),
        (geometry.sap_2.center_x_m, geometry.sap_2.center_y_m, geometry.sap_2.radius_m),
    )
    for index, sap in enumerate(saps):
        sap_cladding_distance = math.hypot(sap[0], sap[1])
        if _internally_touching(sap_cladding_distance, sap[2], geometry.cladding_radius_m):
            raise PandaMeshGenerationError(
                "touching_interfaces",
                f"SAP {index + 1} touches the cladding boundary and cannot form a mesh interface.",
            )
        core_distance = math.hypot(sap[0] - core[0], sap[1] - core[1])
        if _touching(core_distance, sap[2], core[2]):
            raise PandaMeshGenerationError(
                "touching_interfaces",
                f"SAP {index + 1} touches the core boundary and cannot form a mesh interface.",
            )
    sap_distance = math.hypot(saps[0][0] - saps[1][0], saps[0][1] - saps[1][1])
    if _touching(sap_distance, saps[0][2], saps[1][2]):
        raise PandaMeshGenerationError(
            "touching_interfaces",
            "SAP boundaries touch and cannot form separate mesh regions.",
        )


def _find_cladding_seed(geometry: PandaGeometry) -> tuple[float, float]:
    radius = geometry.cladding_radius_m * 0.8
    inclusions = (
        (
            geometry.core_center_x_m,
            geometry.core_center_y_m,
            geometry.core_radius_m,
        ),
        (
            geometry.sap_1.center_x_m,
            geometry.sap_1.center_y_m,
            geometry.sap_1.radius_m,
        ),
        (
            geometry.sap_2.center_x_m,
            geometry.sap_2.center_y_m,
            geometry.sap_2.radius_m,
        ),
    )
    for index in range(720):
        angle = 2.0 * math.pi * index / 720.0
        candidate = (radius * math.cos(angle), radius * math.sin(angle))
        if all(
            math.hypot(candidate[0] - center_x, candidate[1] - center_y) > inclusion_radius
            for center_x, center_y, inclusion_radius in inclusions
        ):
            return candidate
    raise PandaMeshGenerationError(
        "cladding_seed_unavailable",
        "Could not find an interior cladding region seed.",
    )


def _target_areas_m2(
    geometry: PandaGeometry, refinement_level: int
) -> dict[PandaMeshRegion, float]:
    refinement_factor = 2.0**refinement_level
    cladding_edge = geometry.cladding_radius_m / (8.0 * refinement_factor)
    core_edge = geometry.core_radius_m / (4.0 * refinement_factor)
    sap_edge_1 = geometry.sap_1.radius_m / (6.0 * refinement_factor)
    sap_edge_2 = geometry.sap_2.radius_m / (6.0 * refinement_factor)
    return {
        PandaMeshRegion.CLADDING: 0.5 * cladding_edge**2,
        PandaMeshRegion.CORE: 0.5 * core_edge**2,
        PandaMeshRegion.SAP_1: 0.5 * sap_edge_1**2,
        PandaMeshRegion.SAP_2: 0.5 * sap_edge_2**2,
    }


def _make_pslg(
    geometry: PandaGeometry, refinement_level: int
) -> tuple[dict[str, Any], dict[PandaMeshRegion, float]]:
    scale = geometry.cladding_radius_m
    count = _CIRCLE_POINTS_BY_LEVEL[refinement_level]
    circles: tuple[tuple[float, float, float, PandaMeshRegion], ...] = (
        (
            geometry.core_center_x_m,
            geometry.core_center_y_m,
            geometry.core_radius_m,
            PandaMeshRegion.CORE,
        ),
        (
            geometry.sap_1.center_x_m,
            geometry.sap_1.center_y_m,
            geometry.sap_1.radius_m,
            PandaMeshRegion.SAP_1,
        ),
        (
            geometry.sap_2.center_x_m,
            geometry.sap_2.center_y_m,
            geometry.sap_2.radius_m,
            PandaMeshRegion.SAP_2,
        ),
        (0.0, 0.0, geometry.cladding_radius_m, PandaMeshRegion.CLADDING),
    )
    vertices: list[tuple[float, float]] = []
    segments: list[tuple[int, int]] = []
    for center_x_m, center_y_m, radius_m, _region in circles:
        start = len(vertices)
        points = _circle_points(center_x_m / scale, center_y_m / scale, radius_m / scale, count)
        vertices.extend(points)
        segments.extend((start + index, start + (index + 1) % count) for index in range(count))

    target_areas_m2 = _target_areas_m2(geometry, refinement_level)
    target_areas_normalized = {region: area / scale**2 for region, area in target_areas_m2.items()}
    sap_1_seed = (geometry.sap_1.center_x_m / scale, geometry.sap_1.center_y_m / scale)
    sap_2_seed = (geometry.sap_2.center_x_m / scale, geometry.sap_2.center_y_m / scale)
    core_seed = (geometry.core_center_x_m / scale, geometry.core_center_y_m / scale)
    cladding_seed_m = _find_cladding_seed(geometry)
    cladding_seed = (cladding_seed_m[0] / scale, cladding_seed_m[1] / scale)
    regions = [
        [
            core_seed[0],
            core_seed[1],
            _REGION_ATTRIBUTE[PandaMeshRegion.CORE],
            target_areas_normalized[PandaMeshRegion.CORE],
        ],
        [
            sap_1_seed[0],
            sap_1_seed[1],
            _REGION_ATTRIBUTE[PandaMeshRegion.SAP_1],
            target_areas_normalized[PandaMeshRegion.SAP_1],
        ],
        [
            sap_2_seed[0],
            sap_2_seed[1],
            _REGION_ATTRIBUTE[PandaMeshRegion.SAP_2],
            target_areas_normalized[PandaMeshRegion.SAP_2],
        ],
        [
            cladding_seed[0],
            cladding_seed[1],
            _REGION_ATTRIBUTE[PandaMeshRegion.CLADDING],
            target_areas_normalized[PandaMeshRegion.CLADDING],
        ],
    ]
    return {"vertices": vertices, "segments": segments, "regions": regions}, target_areas_m2


def _triangle_metrics(
    first: tuple[float, float], second: tuple[float, float], third: tuple[float, float]
) -> tuple[float, float, float]:
    sides = (
        math.hypot(second[0] - third[0], second[1] - third[1]),
        math.hypot(first[0] - third[0], first[1] - third[1]),
        math.hypot(first[0] - second[0], first[1] - second[1]),
    )
    twice_area = abs(
        (second[0] - first[0]) * (third[1] - first[1])
        - (second[1] - first[1]) * (third[0] - first[0])
    )
    denominator = sum(side**2 for side in sides)
    normalized_quality = 2.0 * math.sqrt(3.0) * twice_area / denominator
    angles = []
    for opposite, adjacent_a, adjacent_b in (
        (sides[0], sides[1], sides[2]),
        (sides[1], sides[0], sides[2]),
        (sides[2], sides[0], sides[1]),
    ):
        cosine = (adjacent_a**2 + adjacent_b**2 - opposite**2) / (2.0 * adjacent_a * adjacent_b)
        angles.append(math.degrees(math.acos(max(-1.0, min(1.0, cosine)))))
    return twice_area, min(angles), max(0.0, min(1.0, normalized_quality))


def _as_float_pair(point: Iterable[float], scale: float) -> tuple[float, float]:
    values = tuple(float(value) * scale for value in point)
    if len(values) != 2 or not all(math.isfinite(value) for value in values):
        raise PandaMeshGenerationError(
            "invalid_node",
            "Triangle returned a non-finite mesh node.",
        )
    return values[0], values[1]


def _as_element(element: Iterable[int]) -> tuple[int, int, int]:
    values = tuple(int(value) for value in element)
    if len(values) != 3:
        raise PandaMeshGenerationError(
            "invalid_element",
            "Triangle returned an element with an invalid node count.",
        )
    return values[0], values[1], values[2]


def generate_panda_mesh(request: PandaMeshRequest) -> PandaMeshResult:
    _validate_non_tangent_geometry(request.geometry)
    pslg, target_areas_m2 = _make_pslg(request.geometry, request.refinement_level)
    try:
        triangulation = _triangle_module().triangulate(pslg, "pDq20aAQ")
    except Exception as error:
        raise PandaMeshGenerationError(
            "triangulation_failed",
            "Triangle failed to generate the PANDA mesh.",
        ) from error

    if "vertices" not in triangulation or "triangles" not in triangulation:
        raise PandaMeshGenerationError(
            "incomplete_output",
            "Triangle returned an incomplete PANDA mesh.",
        )
    attributes = triangulation.get("triangle_attributes")
    if attributes is None:
        raise PandaMeshGenerationError(
            "missing_region_attributes",
            "Triangle returned no region attributes.",
        )

    scale = request.geometry.cladding_radius_m
    raw_nodes = tuple(_as_float_pair(point, scale) for point in triangulation["vertices"])
    raw_elements = tuple(_as_element(element) for element in triangulation["triangles"])
    raw_tags = tuple(
        _ATTRIBUTE_REGION.get(int(round(float(attribute[0])))) for attribute in attributes
    )
    if any(tag is None for tag in raw_tags) or len(raw_tags) != len(raw_elements):
        raise PandaMeshGenerationError(
            "invalid_region_tags",
            "Triangle returned an unknown or incomplete region tagging.",
        )
    region_tags = tuple(tag for tag in raw_tags if tag is not None)

    region_counts = {region: 0 for region in PandaMeshRegion}
    region_areas = {region: 0.0 for region in PandaMeshRegion}
    minimum_angle = math.inf
    minimum_quality = math.inf
    quality_sum = 0.0
    for element, region in zip(raw_elements, region_tags, strict=True):
        first, second, third = (raw_nodes[index] for index in element)
        twice_area, angle, quality = _triangle_metrics(first, second, third)
        if not math.isfinite(twice_area) or twice_area <= 0.0:
            raise PandaMeshGenerationError(
                "degenerate_element",
                "Triangle returned a degenerate element.",
            )
        region_counts[region] += 1
        region_areas[region] += 0.5 * twice_area
        minimum_angle = min(minimum_angle, angle)
        minimum_quality = min(minimum_quality, quality)
        quality_sum += quality

    if not math.isfinite(minimum_angle) or not math.isfinite(minimum_quality):
        raise PandaMeshGenerationError(
            "empty_mesh",
            "Triangle returned no measurable elements.",
        )
    warnings: list[PandaMeshWarning] = [
        PandaMeshWarning(
            code=PandaMeshWarningCode.POLYGONAL_INTERFACE_APPROXIMATION,
            message="Circular interfaces are represented by piecewise-linear PSLG segments.",
        )
    ]
    if minimum_angle < _QUALITY_TARGET_DEG:
        warnings.append(
            PandaMeshWarning(
                code=PandaMeshWarningCode.QUALITY_BELOW_TARGET,
                message=f"The minimum element angle is {minimum_angle:.3f} degrees.",
            )
        )
    summaries = tuple(
        PandaMeshRegionSummary(
            region=region,
            element_count=region_counts[region],
            target_area_m2=target_areas_m2[region],
            total_area_m2=region_areas[region],
        )
        for region in PandaMeshRegion
    )
    return PandaMeshResult(
        configuration=request,
        nodes_m=raw_nodes,
        elements=raw_elements,
        region_tags=region_tags,
        node_count=len(raw_nodes),
        element_count=len(raw_elements),
        region_summaries=summaries,
        quality=PandaMeshQuality(
            minimum_angle_deg=minimum_angle,
            minimum_normalized_quality=minimum_quality,
            mean_normalized_quality=quality_sum / len(raw_elements),
        ),
        warnings=tuple(warnings),
        model_manifest=PandaMeshManifest(),
    )


__all__ = ["generate_panda_mesh"]
