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
    pressure_induced_phase_birefringence: _NonNegativeFiniteFloat = 0.0
    pressure_induced_phase_birefringence_relative_change: _OptionalNonNegativeFiniteFloat = None
    pressure_induced_phase_birefringence_status: Literal[
        "unavailable", "not_converged", "converged"
    ] = "unavailable"

    @model_validator(mode="after")
    def validate_status(self) -> Self:
        if self.refinement_level == 0 and (
            self.relative_change is not None
            or self.status != "unavailable"
            or self.local_material_birefringence_relative_change is not None
            or self.local_material_birefringence_status != "unavailable"
            or self.pressure_induced_phase_birefringence_relative_change is not None
            or self.pressure_induced_phase_birefringence_status != "unavailable"
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
            or self.pressure_induced_phase_birefringence_relative_change is None
            or self.pressure_induced_phase_birefringence_status == "unavailable"
        ):
            raise PydanticCustomError(
                "refinement_convergence_state_invalid",
                "Refined levels require relative changes and available convergence states.",
            )
        return self


class PandaThermalFemManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["fem_generalized_plane_strain"] = "fem_generalized_plane_strain"
    model_version: Literal["1.2.0"] = "1.2.0"
    method: Literal["fem_generalized_plane_strain"] = "fem_generalized_plane_strain"
    stress_measure: Literal["cauchy_stress"] = "cauchy_stress"
    quantity_type: Literal["quantitative_mechanical_output"] = "quantitative_mechanical_output"
    stress_units: Literal["Pa"] = "Pa"
    displacement_units: Literal["m"] = "m"
    strain_units: Literal["1"] = "1"
    exterior_boundary_model: Literal[
        "traction_free_at_zero_pressure_or_prescribed_bare_glass_lateral_pressure"
    ] = "traction_free_at_zero_pressure_or_prescribed_bare_glass_lateral_pressure"
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
        "M1-7.3",
        "M1-7.5",
        "M1-8.1",
        "M1-8.2",
        "M1-8.3",
        "M1-8.4",
    )
    birefringence_computed: Literal[True] = True
    birefringence_scope: Literal["local_material_and_first_order_scalar_lp01_phase"] = (
        "local_material_and_first_order_scalar_lp01_phase"
    )
    birefringence_quantity: Literal["signed_local_and_modal_phase_index_differences"] = (
        "signed_local_and_modal_phase_index_differences"
    )
    birefringence_units: Literal["1"] = "1"
    stress_optic_coefficient_units: Literal["Pa^-1"] = "Pa^-1"
    local_not_modal: Literal[True] = True
    modal_phase_estimate_computed: Literal[True] = True
    modal_phase_estimate_method: Literal[
        "First-order scalar LP₀₁ photoelastic phase-birefringence estimate."
    ] = "First-order scalar LP₀₁ photoelastic phase-birefringence estimate."
    pressure_boundary_model: Literal["bare_glass_lateral_pressure_when_requested"] = (
        "bare_glass_lateral_pressure_when_requested"
    )
    pressure_units: Literal["Pa"] = "Pa"
    pressure_sign_convention: Literal["sigma_n_equals_minus_p_n"] = "sigma_n_equals_minus_p_n"
    pressure_scope: Literal["uncoated_outer_glass_boundary"] = "uncoated_outer_glass_boundary"
    pressure_exclusions: tuple[str, ...] = (
        "coating mechanics are outside the model",
        "support contact is outside the model",
        "load transfer through packaging is outside the model",
    )
    free_resultant_scope: Literal["ends_not_pressure_loaded"] = "ends_not_pressure_loaded"
    hydrostatic_end_face_loading: Literal["requires_changed_axial_loading_condition"] = (
        "requires_changed_axial_loading_condition"
    )
    hydrostatic_limitation: Literal[
        "pressure_on_end_faces_requires_changing_the_axial_loading_condition"
    ] = "pressure_on_end_faces_requires_changing_the_axial_loading_condition"
    optical_mode_model: Literal["degenerate_gaussian_lp01_scalar_weak_guidance"] = (
        "degenerate_gaussian_lp01_scalar_weak_guidance"
    )
    optical_perturbation_matrix: Literal["real_symmetric_2x2_hermitian"] = (
        "real_symmetric_2x2_hermitian"
    )
    moving_boundary_contribution: Literal["not_included"] = "not_included"
    vector_mode_validation: Literal["not_validated"] = "not_validated"
    group_birefringence: Literal["unavailable_single_wavelength"] = "unavailable_single_wavelength"
    torsion_capabilities: tuple[str, ...] = (
        "none",
        "saint_venant_homogeneous_circular_reference",
    )
    assumptions: tuple[str, ...] = (
        "small strain isotropic thermoelasticity",
        "generalized plane strain with uniform axial strain",
        "zero xz and yz shear strains",
        "piecewise constant material data per mesh element",
        "traction-free exterior with no imposed exterior displacement when pressure is zero",
        "positive pressure is lateral pressure acting directly on a bare fibre",
        "free axial resultant means that fibre ends are not pressure-loaded",
        "controlled rigid-body anchors only",
    )
    limitations: tuple[str, ...] = (
        "material and thermal values may be demonstration data rather than measured fibre data",
        "first-order triangles provide a mesh-dependent approximation",
        "local material stress-optic birefringence is computed without modal propagation",
        "the scalar modal estimate is not a validated vector-mode solution",
        "modal phase birefringence is a first-order estimate",
        "moving-boundary and deformed-waveguide contributions are not included",
        "group birefringence needs wavelength-dependent material data and "
        "recalculated modal fields",
        "torsion is an analytical homogeneous circular benchmark and is not PANDA torsion",
        "demonstration material coefficients are not validated fibre measurements",
    )


class PandaThermalFemWarning(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    code: Literal[
        "demonstration_data",
        "convergence_unavailable",
        "convergence_above_threshold",
        "local_material_birefringence_convergence_above_threshold",
        "pressure_phase_birefringence_convergence_above_threshold",
    ]
    message: Annotated[str, Field(strict=True, min_length=1)]
    refinement_level: _NonNegativeInt | None = None


class PandaThermalFemStressSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    area_m2: _PositiveFiniteFloat
    average_stress_xx_pa: _FiniteFloat
    average_stress_yy_pa: _FiniteFloat
    average_stress_zz_pa: _FiniteFloat
    average_stress_xy_pa: _FiniteFloat
    principal_difference_pa: _NonNegativeFiniteFloat
    principal_axis_angle_rad: _FiniteFloat


class PandaThermalFemModalEstimate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    state_1_index_shift: _FiniteFloat
    state_2_index_shift: _FiniteFloat
    common_index_shift: _FiniteFloat
    signed_phase_birefringence: _FiniteFloat
    phase_birefringence_magnitude: _NonNegativeFiniteFloat
    signed_delta_beta_per_m: _FiniteFloat
    beat_length_m: _OptionalFiniteFloat
    beat_length_status: Literal["finite", "undefined within numerical tolerance"]
    state_1_axis_angle_rad: _OptionalFiniteFloat
    state_2_axis_angle_rad: _OptionalFiniteFloat
    slow_axis_angle_rad: _OptionalFiniteFloat
    perturbation_matrix: tuple[tuple[_FiniteFloat, _FiniteFloat], tuple[_FiniteFloat, _FiniteFloat]]
    eigenvalue_shifts: tuple[_FiniteFloat, _FiniteFloat]
    signed_convention: Literal["state_1_is_unoriented_eigenaxis_closest_to_global_positive_x"] = (
        "state_1_is_unoriented_eigenaxis_closest_to_global_positive_x"
    )

    @model_validator(mode="after")
    def validate_matrix_and_beat(self) -> Self:
        matrix = self.perturbation_matrix
        if matrix[0][1] != matrix[1][0]:
            raise PydanticCustomError(
                "modal_perturbation_not_hermitian",
                "The real perturbation matrix must be symmetric and Hermitian.",
            )
        if self.beat_length_status == "finite":
            if self.beat_length_m is None or self.beat_length_m <= 0.0:
                raise PydanticCustomError(
                    "modal_beat_length_invalid",
                    "A finite beat-length status requires a positive beat length.",
                )
        elif self.beat_length_m is not None:
            raise PydanticCustomError(
                "modal_zero_beat_length_state_invalid",
                "An undefined beat length must be represented by a null value.",
            )
        return self


class PandaThermalFemGroupBirefringence(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    available: Literal[False] = False
    value: Literal[None] = None
    reason: Literal["wavelength_dependent_inputs_unavailable"] = (
        "wavelength_dependent_inputs_unavailable"
    )
    requirements: tuple[str, ...] = (
        "wavelength-dependent material refractive indices",
        "wavelength-dependent photoelastic coefficients when relevant",
        "modal fields recalculated at each wavelength",
    )


class PandaThermalFemOpticalBirefringence(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    method: Literal["First-order scalar LP₀₁ photoelastic phase-birefringence estimate."] = (
        "First-order scalar LP₀₁ photoelastic phase-birefringence estimate."
    )
    scalar_weak_guidance_estimate: Literal[True] = True
    validated_vector_mode_solution: Literal[False] = False
    moving_boundary_or_deformed_waveguide_included: Literal[False] = False
    zero_pressure_residual: PandaThermalFemModalEstimate
    total_combined: PandaThermalFemModalEstimate
    pressure_induced: PandaThermalFemModalEstimate
    group_birefringence: PandaThermalFemGroupBirefringence


class PandaThermalFemTorsionResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    capability: Literal["none", "saint_venant_homogeneous_circular_reference"]
    analytical_mechanics_benchmark_only: Literal[True] = True
    heterogeneous_panda_torsion: Literal[False] = False
    polarization_coupling_included: Literal[False] = False
    used_in_transverse_scalar_optical_model: Literal[False] = False
    input_mode: Literal["twist_rate", "applied_torque"] | None
    twist_rate_per_m: _FiniteFloat
    applied_torque_n_m: _FiniteFloat
    shear_modulus_pa: _PositiveFiniteFloat
    polar_moment_m4: _PositiveFiniteFloat
    reference_radius_m: _PositiveFiniteFloat
    element_centroid_stress_xz_pa: tuple[_FiniteFloat, ...]
    element_centroid_stress_yz_pa: tuple[_FiniteFloat, ...]
    maximum_boundary_shear_pa: _NonNegativeFiniteFloat


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
    element_pressure_increment_stress_xx_pa: tuple[_FiniteFloat, ...]
    element_pressure_increment_stress_yy_pa: tuple[_FiniteFloat, ...]
    element_pressure_increment_stress_zz_pa: tuple[_FiniteFloat, ...]
    element_pressure_increment_stress_xy_pa: tuple[_FiniteFloat, ...]
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
    baseline_core_summary: PandaThermalFemStressSummary
    pressure_increment_core_summary: PandaThermalFemStressSummary
    anchor_reactions: PandaThermalFemAnchorReactions
    force_balance: PandaThermalFemForceBalance
    convergence: tuple[PandaThermalFemConvergenceSummary, ...]
    qualitative_kernel_fem_shape_comparison: "PandaThermalFemShapeComparison"
    optical_birefringence: PandaThermalFemOpticalBirefringence
    torsion: PandaThermalFemTorsionResult
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
            self.element_pressure_increment_stress_xx_pa,
            self.element_pressure_increment_stress_yy_pa,
            self.element_pressure_increment_stress_zz_pa,
            self.element_pressure_increment_stress_xy_pa,
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
        if (
            len(self.torsion.element_centroid_stress_xz_pa) != element_count
            or len(self.torsion.element_centroid_stress_yz_pa) != element_count
        ):
            raise PydanticCustomError(
                "thermal_fem_torsion_element_count_mismatch",
                "Torsion element arrays must match the selected mesh elements.",
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
    "PandaThermalFemGroupBirefringence",
    "PandaThermalFemManifest",
    "PandaThermalFemModalEstimate",
    "PandaThermalFemOpticalBirefringence",
    "PandaThermalFemResult",
    "PandaThermalFemShapeComparison",
    "PandaThermalFemStressSummary",
    "PandaThermalFemTorsionResult",
    "PandaThermalFemWarning",
]
