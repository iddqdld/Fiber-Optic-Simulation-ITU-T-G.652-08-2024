import math
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from fibre_sim.panda_mesh import PandaMeshResult

from .request import PandaThermalFemRequest

_FiniteFloat = Annotated[float, Field(strict=True, allow_inf_nan=False)]
_NonNegativeFiniteFloat = Annotated[
    float,
    Field(strict=True, ge=0, allow_inf_nan=False),
]
_PositiveFiniteFloat = Annotated[
    float,
    Field(strict=True, gt=0, allow_inf_nan=False),
]
_PositiveInt = Annotated[int, Field(strict=True, gt=0)]
_NonNegativeInt = Annotated[int, Field(strict=True, ge=0)]
_OptionalFiniteFloat = _FiniteFloat | None
_NodeIndex = Annotated[int, Field(strict=True, ge=0)]


class PandaThermalFemCalculationError(ValueError):
    def __init__(self, reason: str, message: str) -> None:
        self.reason = reason
        super().__init__(message)


class PandaThermalFemCoreSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    area_m2: _PositiveFiniteFloat
    average_stress_xx_pa: _FiniteFloat
    average_stress_yy_pa: _FiniteFloat
    average_stress_zz_pa: _FiniteFloat
    average_stress_xy_pa: _FiniteFloat
    principal_max_pa: _FiniteFloat
    principal_min_pa: _FiniteFloat
    principal_difference_pa: _NonNegativeFiniteFloat
    principal_axis_angle_rad: _FiniteFloat


class PandaThermalFemAnchorReactions(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    primary_node_index: _NodeIndex
    secondary_node_index: _NodeIndex
    primary_reaction_x_n_per_m: _FiniteFloat
    primary_reaction_y_n_per_m: _FiniteFloat
    secondary_reaction_x_n_per_m: _FiniteFloat
    secondary_reaction_y_n_per_m: _FiniteFloat


class PandaThermalFemForceBalance(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    transverse_free_residual_l2_n_per_m: _NonNegativeFiniteFloat
    transverse_resultant_x_n_per_m: _FiniteFloat
    transverse_resultant_y_n_per_m: _FiniteFloat
    axial_resultant_n: _FiniteFloat
    axial_target_n: _OptionalFiniteFloat
    axial_residual_n: _OptionalFiniteFloat


class PandaThermalFemConvergenceSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    refinement_level: _NonNegativeInt
    node_count: _PositiveInt
    element_count: _PositiveInt
    core_average_principal_difference_pa: _NonNegativeFiniteFloat
    relative_change: _OptionalFiniteFloat
    status: Literal["unavailable", "not_converged", "converged"]

    @model_validator(mode="after")
    def validate_status(self) -> Self:
        if self.refinement_level == 0 and (
            self.relative_change is not None or self.status != "unavailable"
        ):
            raise PydanticCustomError(
                "level_zero_convergence_unavailable",
                "Level zero must mark convergence as unavailable.",
            )
        if self.refinement_level > 0 and self.relative_change is None:
            raise PydanticCustomError(
                "refinement_relative_change_missing",
                "Refined levels require a relative convergence change.",
            )
        return self


class PandaThermalFemManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["fem_generalized_plane_strain"] = "fem_generalized_plane_strain"
    model_version: Literal["1.0.0"] = "1.0.0"
    method: Literal["fem_generalized_plane_strain"] = "fem_generalized_plane_strain"
    stress_measure: Literal["cauchy_stress"] = "cauchy_stress"
    quantity_type: Literal["quantitative_mechanical_output"] = "quantitative_mechanical_output"
    stress_units: Literal["Pa"] = "Pa"
    displacement_units: Literal["m"] = "m"
    strain_units: Literal["1"] = "1"
    exterior_boundary: Literal["traction_free"] = "traction_free"
    element_family: Literal["first_order_triangles"] = "first_order_triangles"
    axial_strain_model: Literal["uniform_epsilon_zz_0"] = "uniform_epsilon_zz_0"
    equation: Literal["transverse_weak_equilibrium_plus_axial_resultant"] = (
        "transverse_weak_equilibrium_plus_axial_resultant"
    )
    axial_equation: Literal["integral_sigma_zz_d_a_equals_n_z"] = "integral_sigma_zz_d_a_equals_n_z"
    axial_conditions: tuple[str, ...] = (
        "free_resultant",
        "prescribed_force",
        "prescribed_strain",
    )
    thermal_strain_model: Literal["full_per_region_alpha_delta_t"] = "full_per_region_alpha_delta_t"
    birefringence_computed: Literal[False] = False
    assumptions: tuple[str, ...] = (
        "small strain isotropic thermoelasticity",
        "generalized plane strain with uniform axial strain",
        "zero xz and yz shear strains",
        "piecewise constant material data per mesh element",
        "traction-free exterior with no imposed exterior displacement",
        "controlled rigid-body anchors only",
    )
    limitations: tuple[str, ...] = (
        "material and thermal values may be demonstration data rather than measured fibre data",
        "first-order triangles provide a mesh-dependent approximation",
        "no birefringence or photoelastic observable is computed",
    )


class PandaThermalFemWarning(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    code: Literal[
        "demonstration_data",
        "convergence_unavailable",
        "convergence_above_threshold",
    ]
    message: Annotated[str, Field(strict=True, min_length=1)]
    refinement_level: _NonNegativeInt | None = None


class PandaThermalFemResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    configuration: PandaThermalFemRequest
    mesh: PandaMeshResult
    displacement_x_m: tuple[_FiniteFloat, ...]
    displacement_y_m: tuple[_FiniteFloat, ...]
    element_strain_xx: tuple[_FiniteFloat, ...]
    element_strain_yy: tuple[_FiniteFloat, ...]
    element_strain_zz: tuple[_FiniteFloat, ...]
    element_strain_xy: tuple[_FiniteFloat, ...]
    element_stress_xx_pa: tuple[_FiniteFloat, ...]
    element_stress_yy_pa: tuple[_FiniteFloat, ...]
    element_stress_zz_pa: tuple[_FiniteFloat, ...]
    element_stress_xy_pa: tuple[_FiniteFloat, ...]
    element_principal_max_pa: tuple[_FiniteFloat, ...]
    element_principal_min_pa: tuple[_FiniteFloat, ...]
    element_principal_difference_pa: tuple[_NonNegativeFiniteFloat, ...]
    element_principal_axis_angle_rad: tuple[_FiniteFloat, ...]
    epsilon_zz_0: _FiniteFloat
    core_summary: PandaThermalFemCoreSummary
    anchor_reactions: PandaThermalFemAnchorReactions
    force_balance: PandaThermalFemForceBalance
    convergence: tuple[PandaThermalFemConvergenceSummary, ...]
    warnings: tuple[PandaThermalFemWarning, ...]
    model_manifest: PandaThermalFemManifest

    @model_validator(mode="after")
    def validate_output(self) -> Self:
        node_count = self.mesh.node_count
        element_count = self.mesh.element_count
        if len(self.displacement_x_m) != node_count or len(self.displacement_y_m) != node_count:
            raise PydanticCustomError(
                "thermal_fem_displacement_count_mismatch",
                "Nodal displacement arrays must match the selected mesh nodes.",
            )
        element_arrays = (
            self.element_strain_xx,
            self.element_strain_yy,
            self.element_strain_zz,
            self.element_strain_xy,
            self.element_stress_xx_pa,
            self.element_stress_yy_pa,
            self.element_stress_zz_pa,
            self.element_stress_xy_pa,
            self.element_principal_max_pa,
            self.element_principal_min_pa,
            self.element_principal_difference_pa,
            self.element_principal_axis_angle_rad,
        )
        if any(len(values) != element_count for values in element_arrays):
            raise PydanticCustomError(
                "thermal_fem_element_count_mismatch",
                "Element result arrays must match the selected mesh elements.",
            )
        if len(self.convergence) != self.configuration.refinement_level + 1:
            raise PydanticCustomError(
                "thermal_fem_convergence_count_mismatch",
                "Convergence summaries must cover level zero through the selected level.",
            )
        if tuple(item.refinement_level for item in self.convergence) != tuple(
            range(self.configuration.refinement_level + 1)
        ):
            raise PydanticCustomError(
                "thermal_fem_convergence_levels_invalid",
                "Convergence summaries must be ordered by refinement level.",
            )
        for values in (self.displacement_x_m, self.displacement_y_m, *element_arrays):
            if not all(math.isfinite(value) for value in values):
                raise PydanticCustomError(
                    "thermal_fem_non_finite_output",
                    "Thermal FEM output arrays must contain finite values.",
                )
        if not -math.pi / 2.0 <= self.core_summary.principal_axis_angle_rad <= math.pi / 2.0:
            raise PydanticCustomError(
                "thermal_fem_core_axis_angle_invalid",
                "The core principal axis angle must lie in [-pi/2, pi/2].",
            )
        return self


__all__ = [
    "PandaThermalFemAnchorReactions",
    "PandaThermalFemCalculationError",
    "PandaThermalFemConvergenceSummary",
    "PandaThermalFemCoreSummary",
    "PandaThermalFemForceBalance",
    "PandaThermalFemManifest",
    "PandaThermalFemResult",
    "PandaThermalFemWarning",
]
