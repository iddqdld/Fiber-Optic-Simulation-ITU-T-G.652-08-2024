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
_OptionalNonNegativeFiniteFloat = _NonNegativeFiniteFloat | None
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
    stress_optic_coefficient_per_pa: _FiniteFloat
    signed_local_material_birefringence: _FiniteFloat
    local_material_birefringence: _NonNegativeFiniteFloat
    local_material_slow_axis_angle_rad: _OptionalFiniteFloat

    @model_validator(mode="after")
    def validate_local_axis(self) -> Self:
        if self.local_material_slow_axis_angle_rad is not None and not (
            -math.pi / 2.0 <= self.local_material_slow_axis_angle_rad < math.pi / 2.0
        ):
            raise PydanticCustomError(
                "thermal_fem_core_slow_axis_invalid",
                "The core slow optical-axis angle must lie in [-pi/2, pi/2).",
            )
        return self


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
    relative_change: _OptionalNonNegativeFiniteFloat
    status: Literal["unavailable", "not_converged", "converged"]
    core_average_local_material_birefringence: _NonNegativeFiniteFloat
    local_material_birefringence_relative_change: _OptionalNonNegativeFiniteFloat
    local_material_birefringence_status: Literal["unavailable", "not_converged", "converged"]

    @model_validator(mode="after")
    def validate_status(self) -> Self:
        if self.refinement_level == 0 and (
            self.relative_change is not None
            or self.status != "unavailable"
            or self.local_material_birefringence_relative_change is not None
            or self.local_material_birefringence_status != "unavailable"
        ):
            raise PydanticCustomError(
                "level_zero_convergence_unavailable",
                "Level zero must mark convergence as unavailable.",
            )
        if self.refinement_level > 0 and (
            self.relative_change is None
            or self.local_material_birefringence_relative_change is None
            or self.status == "unavailable"
            or self.local_material_birefringence_status == "unavailable"
        ):
            raise PydanticCustomError(
                "refinement_convergence_state_invalid",
                "Refined levels require relative changes and available convergence states.",
            )
        return self


class PandaThermalFemManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["fem_generalized_plane_strain"] = "fem_generalized_plane_strain"
    model_version: Literal["1.1.0"] = "1.1.0"
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
    equation_references: tuple[str, ...] = (
        "M1-6.9",
        "M1-6.10",
        "M1-6.11",
        "M1-6.12",
    )
    birefringence_computed: Literal[True] = True
    birefringence_scope: Literal["local_material_only"] = "local_material_only"
    birefringence_quantity: Literal["signed_local_material_index_difference"] = (
        "signed_local_material_index_difference"
    )
    birefringence_units: Literal["1"] = "1"
    stress_optic_coefficient_units: Literal["Pa^-1"] = "Pa^-1"
    local_not_modal: Literal[True] = True
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
        "local material stress-optic birefringence is computed without modal propagation",
        "modal phase and group birefringence and beat length are not computed",
        "demonstration material coefficients are not validated fibre measurements",
    )


class PandaThermalFemWarning(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    code: Literal[
        "demonstration_data",
        "convergence_unavailable",
        "convergence_above_threshold",
        "local_material_birefringence_convergence_above_threshold",
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
    element_stress_optic_coefficient_per_pa: tuple[_FiniteFloat, ...]
    element_signed_local_material_birefringence: tuple[_FiniteFloat, ...]
    element_local_material_birefringence: tuple[_NonNegativeFiniteFloat, ...]
    element_local_material_slow_axis_angle_rad: tuple[_OptionalFiniteFloat, ...]
    epsilon_zz_0: _FiniteFloat
    core_summary: PandaThermalFemCoreSummary
    anchor_reactions: PandaThermalFemAnchorReactions
    force_balance: PandaThermalFemForceBalance
    convergence: tuple[PandaThermalFemConvergenceSummary, ...]
    qualitative_kernel_fem_shape_comparison: "PandaThermalFemShapeComparison"
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
            self.element_stress_optic_coefficient_per_pa,
            self.element_signed_local_material_birefringence,
            self.element_local_material_birefringence,
        )
        if any(len(values) != element_count for values in element_arrays):
            raise PydanticCustomError(
                "thermal_fem_element_count_mismatch",
                "Element result arrays must match the selected mesh elements.",
            )
        if len(self.element_local_material_slow_axis_angle_rad) != element_count:
            raise PydanticCustomError(
                "thermal_fem_slow_axis_count_mismatch",
                "Element slow optical-axis angles must match the selected mesh elements.",
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
        for angle in self.element_principal_axis_angle_rad:
            if not -math.pi / 2.0 <= angle <= math.pi / 2.0:
                raise PydanticCustomError(
                    "thermal_fem_principal_axis_angle_invalid",
                    "Element principal-axis angles must lie in [-pi/2, pi/2].",
                )
        for slow_axis_angle in self.element_local_material_slow_axis_angle_rad:
            if slow_axis_angle is not None and not (
                -math.pi / 2.0 <= slow_axis_angle < math.pi / 2.0
            ):
                raise PydanticCustomError(
                    "thermal_fem_slow_axis_angle_invalid",
                    "Element slow optical-axis angles must lie in [-pi/2, pi/2).",
                )
        if not -math.pi / 2.0 <= self.core_summary.principal_axis_angle_rad <= math.pi / 2.0:
            raise PydanticCustomError(
                "thermal_fem_core_axis_angle_invalid",
                "The core principal axis angle must lie in [-pi/2, pi/2].",
            )
        return self


class PandaThermalFemShapeComparison(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["qualitative_kernel_fem_shape_comparison"] = (
        "qualitative_kernel_fem_shape_comparison"
    )
    quantitative: Literal[False] = False
    units: Literal["1"] = "1"
    domain: Literal["core_elements"] = "core_elements"
    sample_count: _NonNegativeInt
    available: Annotated[bool, Field(strict=True)]
    kernel_scale: _OptionalFiniteFloat
    fem_signed_deviatoric_stress_scale_pa: _OptionalFiniteFloat
    best_polarity: Literal[-1, 1] | None
    rmse: _OptionalNonNegativeFiniteFloat
    correlation: _OptionalFiniteFloat
    sign_agreement: _OptionalNonNegativeFiniteFloat
    unavailable_reason: (
        Literal[
            "insufficient_core_elements",
            "zero_or_nonfinite_scale",
            "nonfinite_metric",
        ]
        | None
    )
    limitations: tuple[str, ...] = (
        "the qualitative kernel has undefined sign and scale, so the best polarity is fitted",
        "this is a normalized shape comparison and not a stress error",
        "quantitative Eshelby error and birefringence error are unavailable",
    )

    @model_validator(mode="after")
    def validate_comparison(self) -> Self:
        if not self.available:
            if self.best_polarity is not None or any(
                value is not None for value in (self.rmse, self.correlation, self.sign_agreement)
            ):
                raise PydanticCustomError(
                    "unavailable_comparison_has_metrics",
                    "Unavailable comparisons must not publish shape metrics.",
                )
            if self.unavailable_reason is None:
                raise PydanticCustomError(
                    "unavailable_comparison_reason_missing",
                    "Unavailable comparisons require a reason.",
                )
            return self
        if self.sample_count < 2 or self.unavailable_reason is not None:
            raise PydanticCustomError(
                "available_comparison_state_invalid",
                "Available comparisons require samples and no unavailable reason.",
            )
        if self.kernel_scale is None or self.fem_signed_deviatoric_stress_scale_pa is None:
            raise PydanticCustomError(
                "available_comparison_scales_missing",
                "Available comparisons require both normalization scales.",
            )
        if self.kernel_scale <= 0.0 or self.fem_signed_deviatoric_stress_scale_pa <= 0.0:
            raise PydanticCustomError(
                "available_comparison_scales_invalid",
                "Available comparison scales must be positive.",
            )
        if self.best_polarity is None or self.rmse is None or self.sign_agreement is None:
            raise PydanticCustomError(
                "available_comparison_metrics_missing",
                "Available comparisons require polarity, RMSE, and sign agreement.",
            )
        if self.rmse > 2.0 or not 0.0 <= self.sign_agreement <= 1.0:
            raise PydanticCustomError(
                "comparison_metric_out_of_range",
                "Normalized comparison metrics are outside their allowed ranges.",
            )
        if self.correlation is not None and not -1.0 <= self.correlation <= 1.0:
            raise PydanticCustomError(
                "comparison_correlation_out_of_range",
                "Comparison correlation must lie in [-1, 1].",
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
    "PandaThermalFemShapeComparison",
    "PandaThermalFemWarning",
]
