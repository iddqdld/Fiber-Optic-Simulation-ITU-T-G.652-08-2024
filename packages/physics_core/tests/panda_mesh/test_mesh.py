import importlib
import json
import math

import numpy as np
import pytest
from pydantic import BaseModel, ValidationError

from fibre_sim.panda_mesh import (
    PandaMeshGenerationError,
    PandaMeshRegion,
    PandaMeshRegionSummary,
    PandaMeshRequest,
    PandaMeshResult,
    generate_panda_mesh,
)
from fibre_sim.photoelastic import CircularSAP, PandaGeometry


def geometry(
    *,
    core_radius_m: float = 4.1e-6,
    cladding_radius_m: float = 62.5e-6,
    core_center_x_m: float = 0.0,
    core_center_y_m: float = 0.0,
    sap_1: CircularSAP | None = None,
    sap_2: CircularSAP | None = None,
) -> PandaGeometry:
    return PandaGeometry(
        core_radius_m=core_radius_m,
        cladding_radius_m=cladding_radius_m,
        core_center_x_m=core_center_x_m,
        core_center_y_m=core_center_y_m,
        sap_1=sap_1 or CircularSAP(radius_m=17.0e-6, center_x_m=-32.0e-6, center_y_m=0.0),
        sap_2=sap_2 or CircularSAP(radius_m=17.0e-6, center_x_m=32.0e-6, center_y_m=0.0),
    )


def result(level: int = 0) -> PandaMeshResult:
    return generate_panda_mesh(PandaMeshRequest(geometry=geometry(), refinement_level=level))


def circles(model_geometry: PandaGeometry) -> dict[PandaMeshRegion, tuple[float, float, float]]:
    return {
        PandaMeshRegion.CLADDING: (0.0, 0.0, model_geometry.cladding_radius_m),
        PandaMeshRegion.CORE: (
            model_geometry.core_center_x_m,
            model_geometry.core_center_y_m,
            model_geometry.core_radius_m,
        ),
        PandaMeshRegion.SAP_1: (
            model_geometry.sap_1.center_x_m,
            model_geometry.sap_1.center_y_m,
            model_geometry.sap_1.radius_m,
        ),
        PandaMeshRegion.SAP_2: (
            model_geometry.sap_2.center_x_m,
            model_geometry.sap_2.center_y_m,
            model_geometry.sap_2.radius_m,
        ),
    }


def region_for_point(point: tuple[float, float], model_geometry: PandaGeometry) -> PandaMeshRegion:
    for region in (PandaMeshRegion.CORE, PandaMeshRegion.SAP_1, PandaMeshRegion.SAP_2):
        center_x, center_y, radius = circles(model_geometry)[region]
        if math.hypot(point[0] - center_x, point[1] - center_y) < radius:
            return region
    return PandaMeshRegion.CLADDING


def test_output_is_deterministic_and_has_all_regions() -> None:
    first = result()
    second = result()

    assert first.model_dump_json() == second.model_dump_json()
    assert set(first.region_tags) == set(PandaMeshRegion)
    assert first.configuration == PandaMeshRequest(geometry=geometry())
    assert first.model_manifest.method == "constrained_delaunay"
    assert first.model_manifest.model_version == "1.0.0"
    assert first.model_manifest.element_family == "first_order_triangles"
    assert first.model_manifest.mesh_only is True
    assert first.model_manifest.solved_fem_fields is False


def test_nodes_are_finite_in_domain_and_elements_are_positive() -> None:
    mesh = result()
    model_geometry = geometry()

    assert all(math.isfinite(value) for node in mesh.nodes_m for value in node)
    assert all(
        math.hypot(node[0], node[1]) <= model_geometry.cladding_radius_m + 1.0e-12
        for node in mesh.nodes_m
    )
    for first_index, second_index, third_index in mesh.elements:
        first, second, third = (
            mesh.nodes_m[first_index],
            mesh.nodes_m[second_index],
            mesh.nodes_m[third_index],
        )
        twice_area = abs(
            (second[0] - first[0]) * (third[1] - first[1])
            - (second[1] - first[1]) * (third[0] - first[0])
        )
        assert twice_area > 0.0


def test_counts_region_summaries_and_quality_are_consistent() -> None:
    mesh = result()

    assert mesh.node_count == len(mesh.nodes_m)
    assert mesh.element_count == len(mesh.elements) == len(mesh.region_tags)
    assert sum(summary.element_count for summary in mesh.region_summaries) == mesh.element_count
    assert all(summary.target_area_m2 > 0.0 for summary in mesh.region_summaries)
    assert 0.0 <= mesh.quality.minimum_normalized_quality <= 1.0
    assert 0.0 <= mesh.quality.mean_normalized_quality <= 1.0
    assert mesh.quality.minimum_angle_deg > 0.0


def test_region_tags_follow_inclusion_interfaces() -> None:
    mesh = result()
    model_geometry = geometry()
    edge_regions: dict[tuple[int, int], set[PandaMeshRegion]] = {}
    interface_regions: set[PandaMeshRegion] = set()

    for element, region in zip(mesh.elements, mesh.region_tags, strict=True):
        centroid = (
            sum(mesh.nodes_m[index][0] for index in element) / 3.0,
            sum(mesh.nodes_m[index][1] for index in element) / 3.0,
        )
        assert region_for_point(centroid, model_geometry) is region
        for first, second in (
            (element[0], element[1]),
            (element[1], element[2]),
            (element[2], element[0]),
        ):
            edge = (first, second) if first < second else (second, first)
            edge_regions.setdefault(edge, set()).add(region)

    boundaries = circles(model_geometry)
    for edge, regions in edge_regions.items():
        if len(regions) < 2:
            continue
        assert len(regions) == 2
        assert PandaMeshRegion.CLADDING in regions
        interface_region = next(
            region for region in regions if region is not PandaMeshRegion.CLADDING
        )
        interface_regions.add(interface_region)
        center_x, center_y, radius = boundaries[interface_region]
        for node_index in edge:
            node = mesh.nodes_m[node_index]
            radial_error = abs(math.hypot(node[0] - center_x, node[1] - center_y) - radius)
            assert radial_error <= radius * 0.01 + 1.0e-12

    assert interface_regions == {
        PandaMeshRegion.CORE,
        PandaMeshRegion.SAP_1,
        PandaMeshRegion.SAP_2,
    }


def test_polygonal_boundary_nodes_are_present_for_each_interface() -> None:
    mesh = result()
    model_geometry = geometry()

    for _region, (center_x, center_y, radius) in circles(model_geometry).items():
        near_boundary = [
            node
            for node in mesh.nodes_m
            if abs(math.hypot(node[0] - center_x, node[1] - center_y) - radius)
            <= radius * 0.01 + 1.0e-12
        ]
        assert len(near_boundary) >= 16


def test_refinement_increases_resolution_and_element_count() -> None:
    coarse = result(0)
    medium = result(1)
    fine = result(2)

    assert coarse.node_count < medium.node_count < fine.node_count
    assert coarse.element_count < medium.element_count < fine.element_count
    assert medium.region_summaries[0].target_area_m2 == pytest.approx(
        coarse.region_summaries[0].target_area_m2 / 4.0
    )
    assert fine.region_summaries[0].target_area_m2 == pytest.approx(
        medium.region_summaries[0].target_area_m2 / 4.0
    )


@pytest.mark.parametrize("refinement_level", [-1, 3, True, 1.0])
def test_request_rejects_invalid_refinement_levels(refinement_level: object) -> None:
    with pytest.raises(ValidationError):
        PandaMeshRequest.model_validate(
            {"geometry": geometry(), "refinement_level": refinement_level}
        )


@pytest.mark.parametrize(
    "model_geometry",
    [
        geometry(sap_1=CircularSAP(radius_m=17.0e-6, center_x_m=-21.1e-6, center_y_m=0.0)),
        geometry(
            sap_1=CircularSAP(radius_m=17.0e-6, center_x_m=45.5e-6, center_y_m=0.0),
            sap_2=CircularSAP(radius_m=17.0e-6, center_x_m=-32.0e-6, center_y_m=0.0),
        ),
        geometry(
            sap_1=CircularSAP(radius_m=10.0e-6, center_x_m=30.0e-6, center_y_m=0.0),
            sap_2=CircularSAP(radius_m=10.0e-6, center_x_m=30.0e-6, center_y_m=20.0e-6),
        ),
        geometry(
            sap_1=CircularSAP(radius_m=10.0e-6, center_x_m=30.0e-6, center_y_m=0.0),
            sap_2=CircularSAP(radius_m=10.0e-6, center_x_m=50.0e-6, center_y_m=0.0),
        ),
        geometry(core_radius_m=4.1e-6, core_center_x_m=58.4e-6),
    ],
)
def test_generator_rejects_tangent_interfaces(model_geometry: PandaGeometry) -> None:
    with pytest.raises(PandaMeshGenerationError):
        generate_panda_mesh(PandaMeshRequest(geometry=model_geometry))


def test_public_mesh_models_are_frozen_and_closed() -> None:
    from fibre_sim.panda_mesh import (
        PandaMeshManifest,
        PandaMeshQuality,
        PandaMeshRegionSummary,
        PandaMeshResult,
        PandaMeshWarning,
    )

    models: tuple[type[BaseModel], ...] = (
        PandaMeshRequest,
        PandaMeshManifest,
        PandaMeshQuality,
        PandaMeshRegionSummary,
        PandaMeshResult,
        PandaMeshWarning,
    )
    for model in models:
        assert model.model_config["frozen"] is True
        assert model.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        PandaMeshRequest.model_validate({"geometry": geometry().model_dump(), "extra": True})


def test_result_rejects_duplicate_or_mismatched_region_summaries() -> None:
    mesh = result()
    summaries = list(mesh.region_summaries)
    summaries[-1] = PandaMeshRegionSummary(
        region=summaries[0].region,
        element_count=summaries[-1].element_count,
        target_area_m2=summaries[-1].target_area_m2,
        total_area_m2=summaries[-1].total_area_m2,
    )
    payload = mesh.model_dump()
    payload["region_summaries"] = summaries

    with pytest.raises(ValidationError, match="exactly one summary"):
        type(mesh).model_validate(payload)

    summaries = list(mesh.region_summaries)
    summaries[0] = PandaMeshRegionSummary(
        region=summaries[0].region,
        element_count=summaries[0].element_count + 1,
        target_area_m2=summaries[0].target_area_m2,
        total_area_m2=summaries[0].total_area_m2,
    )
    payload["region_summaries"] = summaries
    with pytest.raises(ValidationError, match="match the element tags"):
        type(mesh).model_validate(payload)


def test_generation_error_exposes_stable_reason() -> None:
    error = PandaMeshGenerationError("invalid_mesh_topology", "Invalid mesh topology.")

    assert error.reason == "invalid_mesh_topology"
    assert str(error) == "Invalid mesh topology."


def test_scikit_fem_accepts_generated_mesh() -> None:
    mesh = result()
    mesh_tri = importlib.import_module("skfem").MeshTri
    fem_mesh = mesh_tri(
        np.asarray(mesh.nodes_m, dtype=float).T,
        np.asarray(mesh.elements, dtype=np.int64).T,
    )

    assert fem_mesh.p.shape == (2, mesh.node_count)
    assert fem_mesh.t.shape == (3, mesh.element_count)
    assert fem_mesh.nelements == mesh.element_count


def test_result_json_has_no_numpy_values() -> None:
    payload = json.loads(result().model_dump_json())

    assert isinstance(payload["nodes_m"][0][0], float)
    assert isinstance(payload["elements"][0][0], int)
