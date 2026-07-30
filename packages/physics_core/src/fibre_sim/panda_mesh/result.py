import math
from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from .request import PandaMeshRegion, PandaMeshRequest

_StrictFiniteFloat = Annotated[float, Field(strict=True, allow_inf_nan=False)]
_NonNegativeStrictFloat = Annotated[
    float,
    Field(strict=True, ge=0, allow_inf_nan=False),
]
_PositiveStrictFloat = Annotated[
    float,
    Field(strict=True, gt=0, allow_inf_nan=False),
]
_NonNegativeStrictInt = Annotated[int, Field(strict=True, ge=0)]
_PositiveStrictInt = Annotated[int, Field(strict=True, gt=0)]
_StrictText = Annotated[str, Field(strict=True, min_length=1)]
_Node = tuple[_StrictFiniteFloat, _StrictFiniteFloat]
_Element = tuple[_NonNegativeStrictInt, _NonNegativeStrictInt, _NonNegativeStrictInt]


class PandaMeshGenerationError(RuntimeError):
    def __init__(self, reason: str, message: str) -> None:
        self.reason = reason
        super().__init__(message)


class PandaMeshWarningCode(StrEnum):
    QUALITY_BELOW_TARGET = "quality_below_target"
    POLYGONAL_INTERFACE_APPROXIMATION = "polygonal_interface_approximation"


class PandaMeshWarning(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    code: PandaMeshWarningCode
    message: _StrictText


class PandaMeshRegionSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    region: PandaMeshRegion
    element_count: _NonNegativeStrictInt
    target_area_m2: _PositiveStrictFloat
    total_area_m2: _NonNegativeStrictFloat


class PandaMeshQuality(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    minimum_angle_deg: _NonNegativeStrictFloat = Field(le=60.0)
    minimum_normalized_quality: _NonNegativeStrictFloat = Field(le=1.0)
    mean_normalized_quality: _NonNegativeStrictFloat = Field(le=1.0)


class PandaMeshManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["panda_constrained_delaunay_mesh"] = "panda_constrained_delaunay_mesh"
    model_version: Literal["1.0.0"] = "1.0.0"
    geometry_model: Literal["PandaGeometry"] = "PandaGeometry"
    interface_model: Literal["piecewise_linear_circular_interfaces"] = (
        "piecewise_linear_circular_interfaces"
    )
    method: Literal["constrained_delaunay"] = "constrained_delaunay"
    element_family: Literal["first_order_triangles"] = "first_order_triangles"
    generator_version: Literal["triangle 20250106"] = "triangle 20250106"
    fem_compatibility_version: Literal["scikit-fem 12.0.2"] = "scikit-fem 12.0.2"
    quality_target_minimum_angle_deg: Literal[20] = 20
    mesh_only: Literal[True] = True
    solved_fem_fields: Literal[False] = False
    coordinate_units: Literal["m"] = "m"
    assumptions: tuple[str, ...] = (
        "circular cladding, core, and SAP boundaries are represented by polygonal PSLG interfaces",
        "Triangle generates a deterministic constrained-Delaunay triangulation",
        "all elements are first-order linear triangles",
    )
    limitations: tuple[str, ...] = (
        "the mesh is a geometry discretization and contains no solved FEM fields",
        "polygonal interfaces approximate the configured circular boundaries",
    )


class PandaMeshResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    configuration: PandaMeshRequest
    nodes_m: tuple[_Node, ...]
    elements: tuple[_Element, ...]
    region_tags: tuple[PandaMeshRegion, ...]
    node_count: _PositiveStrictInt
    element_count: _PositiveStrictInt
    region_summaries: tuple[PandaMeshRegionSummary, ...]
    quality: PandaMeshQuality
    warnings: tuple[PandaMeshWarning, ...]
    model_manifest: PandaMeshManifest

    @model_validator(mode="after")
    def validate_mesh_contract(self) -> Self:
        if self.node_count != len(self.nodes_m):
            raise PydanticCustomError(
                "panda_mesh_node_count_mismatch",
                "node_count must match the number of mesh nodes.",
            )
        if self.element_count != len(self.elements):
            raise PydanticCustomError(
                "panda_mesh_element_count_mismatch",
                "element_count must match the number of mesh elements.",
            )
        if len(self.region_tags) != self.element_count:
            raise PydanticCustomError(
                "panda_mesh_region_tag_count_mismatch",
                "There must be one region tag for every element.",
            )
        summary_regions = tuple(summary.region for summary in self.region_summaries)
        if len(summary_regions) != 4 or set(summary_regions) != set(PandaMeshRegion):
            raise PydanticCustomError(
                "panda_mesh_region_summary_mismatch",
                "There must be exactly one summary for every mesh region.",
            )
        summary_counts = {
            summary.region: summary.element_count for summary in self.region_summaries
        }
        tag_counts = {region: self.region_tags.count(region) for region in PandaMeshRegion}
        if summary_counts != tag_counts or sum(summary_counts.values()) != self.element_count:
            raise PydanticCustomError(
                "panda_mesh_region_element_count_mismatch",
                "Region summaries must match the element tags and total element count.",
            )
        for element in self.elements:
            if len(set(element)) != 3 or any(index >= self.node_count for index in element):
                raise PydanticCustomError(
                    "panda_mesh_element_invalid",
                    "Mesh elements must contain three distinct valid node indices.",
                )
            first, second, third = (self.nodes_m[index] for index in element)
            twice_area = abs(
                (second[0] - first[0]) * (third[1] - first[1])
                - (second[1] - first[1]) * (third[0] - first[0])
            )
            if not math.isfinite(twice_area) or twice_area <= 0.0:
                raise PydanticCustomError(
                    "panda_mesh_element_degenerate",
                    "Mesh elements must have positive finite area.",
                )
        return self


__all__ = [
    "PandaMeshGenerationError",
    "PandaMeshManifest",
    "PandaMeshQuality",
    "PandaMeshRegionSummary",
    "PandaMeshResult",
    "PandaMeshWarning",
    "PandaMeshWarningCode",
]
