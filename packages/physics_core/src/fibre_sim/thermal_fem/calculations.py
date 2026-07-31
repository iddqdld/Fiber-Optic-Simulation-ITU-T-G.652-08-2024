import math
from dataclasses import dataclass
from typing import Literal, NamedTuple

import numpy as np
from scipy.sparse import bmat, csc_matrix, lil_matrix  # type: ignore[import-untyped]
from scipy.sparse.linalg import spsolve  # type: ignore[import-untyped]
from skfem import Basis, MeshTri  # type: ignore[import-untyped]
from skfem.element import ElementTriP1  # type: ignore[import-untyped]

from fibre_sim.panda_mesh import PandaMeshRegion, PandaMeshResult, generate_panda_mesh
from fibre_sim.photoelastic.calculations import qualitative_kernel_components_at
from fibre_sim.photoelastic.loads import AxialCondition
from fibre_sim.photoelastic.materials import (
    MaterialConfidence,
    PandaMaterial,
    stress_optic_coefficient_per_pa,
)

from .request import PandaThermalFemRequest
from .result import (
    PandaThermalFemAnchorReactions,
    PandaThermalFemCalculationError,
    PandaThermalFemConvergenceSummary,
    PandaThermalFemCoreSummary,
    PandaThermalFemForceBalance,
    PandaThermalFemManifest,
    PandaThermalFemResult,
    PandaThermalFemShapeComparison,
    PandaThermalFemWarning,
)

_CONVERGENCE_THRESHOLD = 0.05
_ZERO_STRESS_TOLERANCE_PA = 1.0e-12
_ZERO_COEFFICIENT_TOLERANCE_PER_PA = 1.0e-30
_REFERENCE_GRADIENTS = np.array(((-1.0, -1.0), (1.0, 0.0), (0.0, 1.0)))


class _ElementResult(NamedTuple):
    strain_xx: float
    strain_yy: float
    strain_zz: float
    strain_xy: float
    stress_xx: float
    stress_yy: float
    stress_zz: float
    stress_xy: float
    principal_max: float
    principal_min: float
    principal_difference: float
    principal_axis_angle: float
    stress_optic_coefficient: float
    signed_local_material_birefringence: float
    local_material_birefringence: float
    local_material_slow_axis_angle: float | None
    area: float


@dataclass(frozen=True)
class _AnchorData:
    primary: int
    secondary: int
    normal_x: float
    normal_y: float


@dataclass(frozen=True)
class _Solve:
    mesh: PandaMeshResult
    displacement_x: np.ndarray
    displacement_y: np.ndarray
    epsilon_zz: float
    elements: tuple[_ElementResult, ...]
    core_summary: PandaThermalFemCoreSummary
    anchors: PandaThermalFemAnchorReactions
    force_balance: PandaThermalFemForceBalance


def _lame(young_modulus_pa: float, poisson_ratio: float) -> tuple[float, float]:
    mu = young_modulus_pa / (2.0 * (1.0 + poisson_ratio))
    lam = young_modulus_pa * poisson_ratio / ((1.0 + poisson_ratio) * (1.0 - 2.0 * poisson_ratio))
    return lam, mu


def _constitutive(young_modulus_pa: float, poisson_ratio: float) -> np.ndarray:
    lam, mu = _lame(young_modulus_pa, poisson_ratio)
    return np.array(
        [
            [lam + 2.0 * mu, lam, lam, 0.0],
            [lam, lam + 2.0 * mu, lam, 0.0],
            [lam, lam, lam + 2.0 * mu, 0.0],
            [0.0, 0.0, 0.0, mu],
        ],
        dtype=float,
    )


def _thermal_strain(cte_per_k: float, temperature_delta_k: float) -> np.ndarray:
    value = cte_per_k * temperature_delta_k
    return np.array([value, value, value, 0.0], dtype=float)


def _material_by_region(request: PandaThermalFemRequest, region: PandaMeshRegion) -> PandaMaterial:
    return {
        PandaMeshRegion.CORE: request.materials.core,
        PandaMeshRegion.CLADDING: request.materials.cladding,
        PandaMeshRegion.SAP_1: request.materials.sap_1,
        PandaMeshRegion.SAP_2: request.materials.sap_2,
    }[region]


def _anchor_data(
    mesh: PandaMeshResult,
    request: PandaThermalFemRequest,
    strategy: str,
) -> _AnchorData:
    points = np.asarray(mesh.nodes_m, dtype=float)
    if strategy == "centered":
        target = np.array(
            [request.geometry.core_center_x_m, request.geometry.core_center_y_m], dtype=float
        )
    else:
        target = np.array([request.geometry.cladding_radius_m * 0.25, 0.0], dtype=float)
    primary = int(np.argmin(np.sum((points - target) ** 2, axis=1)))
    distances = np.sum((points - points[primary]) ** 2, axis=1)
    distances[primary] = -1.0
    secondary = int(np.argmax(distances))
    direction = points[secondary] - points[primary]
    length = float(np.linalg.norm(direction))
    if not math.isfinite(length) or length <= 0.0:
        raise PandaThermalFemCalculationError(
            "anchor_selection_failed", "Could not select two distinct FEM anchor nodes."
        )
    return _AnchorData(
        primary=primary,
        secondary=secondary,
        normal_x=-float(direction[1]) / length,
        normal_y=float(direction[0]) / length,
    )


def _constraint_matrix(node_count: int, anchor: _AnchorData) -> csc_matrix:
    constraints = lil_matrix((3, 2 * node_count), dtype=float)
    constraints[0, 2 * anchor.primary] = 1.0
    constraints[1, 2 * anchor.primary + 1] = 1.0
    constraints[2, 2 * anchor.secondary] = anchor.normal_x
    constraints[2, 2 * anchor.secondary + 1] = anchor.normal_y
    return constraints.tocsc()


def _triangle_data(
    element_areas: np.ndarray,
    inverse_jacobians: np.ndarray,
    element_index: int,
) -> tuple[float, np.ndarray]:
    area = float(element_areas[element_index])
    if not math.isfinite(area) or area <= 0.0:
        raise PandaThermalFemCalculationError(
            "degenerate_element", "The selected mesh contains a degenerate element."
        )
    inverse_jacobian = inverse_jacobians[:, :, element_index]
    gradients = _REFERENCE_GRADIENTS @ inverse_jacobian
    return area, gradients


def _assemble(
    request: PandaThermalFemRequest,
    mesh: PandaMeshResult,
    basis: Basis,
    prescribed_epsilon: float | None,
    axial_target: float | None,
    axial_scale_m: float,
) -> tuple[csc_matrix, np.ndarray, list[tuple[np.ndarray, float, np.ndarray, np.ndarray]]]:
    node_count = mesh.node_count
    displacement_dofs = 2 * node_count
    displacement_stiffness = lil_matrix((displacement_dofs, displacement_dofs), dtype=float)
    displacement_axial_coupling = np.zeros(displacement_dofs, dtype=float)
    axial_stiffness = 0.0
    displacement_load = np.zeros(displacement_dofs, dtype=float)
    axial_load = 0.0
    element_cache: list[tuple[np.ndarray, float, np.ndarray, np.ndarray]] = []
    thermal_temperature_delta = (
        request.thermal.temperature_k - request.thermal.effective_fictive_temperature_k
    )
    element_areas = np.sum(basis.dx, axis=1)
    inverse_jacobians = basis.mapping.invDF(basis.X)[:, :, :, 0]
    for element_index, region in enumerate(mesh.region_tags):
        area, gradients = _triangle_data(element_areas, inverse_jacobians, element_index)
        material = _material_by_region(request, region)
        constitutive = _constitutive(material.young_modulus_pa, material.poisson_ratio)
        b_displacement = np.zeros((4, 6), dtype=float)
        for local_node, (dndx, dndy) in enumerate(gradients):
            column = 2 * local_node
            b_displacement[0, column] = dndx
            b_displacement[1, column + 1] = dndy
            b_displacement[3, column] = dndy
            b_displacement[3, column + 1] = dndx
        b_epsilon = np.array([0.0, 0.0, 1.0, 0.0], dtype=float)
        thermal_strain = _thermal_strain(material.cte_per_k, thermal_temperature_delta)
        local_stiffness = area * b_displacement.T @ constitutive @ b_displacement
        local_coupling = area * b_displacement.T @ constitutive @ b_epsilon
        local_axial_stiffness = area * float(b_epsilon @ constitutive @ b_epsilon)
        local_displacement_load = area * b_displacement.T @ constitutive @ thermal_strain
        local_axial_load = area * float(b_epsilon @ constitutive @ thermal_strain)
        nodes = mesh.elements[element_index]
        dofs = tuple(dof for node in nodes for dof in (2 * node, 2 * node + 1))
        for local_row, global_row in enumerate(dofs):
            displacement_load[global_row] += local_displacement_load[local_row]
            for local_column, global_column in enumerate(dofs):
                displacement_stiffness[global_row, global_column] += local_stiffness[
                    local_row, local_column
                ]
            displacement_axial_coupling[global_row] += local_coupling[local_row]
        axial_stiffness += local_axial_stiffness
        axial_load += local_axial_load
        element_cache.append((b_displacement, area, constitutive, thermal_strain))
    if axial_target is not None:
        axial_load += axial_target
    if prescribed_epsilon is not None:
        return (
            displacement_stiffness.tocsc(),
            displacement_load - displacement_axial_coupling * prescribed_epsilon,
            element_cache,
        )
    mixed_matrix = bmat(
        [
            [
                displacement_stiffness.tocsc(),
                csc_matrix((displacement_axial_coupling / axial_scale_m).reshape(-1, 1)),
            ],
            [
                csc_matrix((displacement_axial_coupling / axial_scale_m).reshape(1, -1)),
                csc_matrix([[axial_stiffness / (axial_scale_m**2)]]),
            ],
        ],
        format="csc",
    )
    mixed_load = np.concatenate(
        (displacement_load, np.array([axial_load / axial_scale_m], dtype=float))
    )
    return mixed_matrix, mixed_load, element_cache


def _solve_augmented(
    matrix: csc_matrix,
    load: np.ndarray,
    constraints: csc_matrix,
) -> tuple[np.ndarray, np.ndarray]:
    augmented = bmat([[matrix, constraints.T], [constraints, None]], format="csc")
    rhs = np.concatenate((load, np.zeros(constraints.shape[0], dtype=float)))
    with np.errstate(all="ignore"):
        solution = spsolve(augmented, rhs)
    if not np.all(np.isfinite(solution)):
        raise PandaThermalFemCalculationError(
            "linear_solver_failed", "The constrained thermoelastic FEM system is singular."
        )
    return solution[: -constraints.shape[0]], solution[-constraints.shape[0] :]


def _element_result(
    b_displacement: np.ndarray,
    area: float,
    constitutive: np.ndarray,
    thermal_strain: np.ndarray,
    local_displacement: np.ndarray,
    epsilon_zz: float,
    stress_optic_coefficient: float,
) -> _ElementResult:
    strain = b_displacement @ local_displacement
    strain[2] = epsilon_zz
    stress = constitutive @ (strain - thermal_strain)
    half_difference = 0.5 * (stress[0] - stress[1])
    radius = math.hypot(half_difference, stress[3])
    principal_max = 0.5 * (stress[0] + stress[1]) + radius
    principal_min = 0.5 * (stress[0] + stress[1]) - radius
    principal_difference = 2.0 * radius
    axis_angle = 0.5 * math.atan2(2.0 * stress[3], stress[0] - stress[1])
    (
        signed_birefringence,
        local_birefringence,
        slow_axis_angle,
    ) = _local_material_observables(
        axis_angle,
        principal_difference,
        stress_optic_coefficient,
    )
    return _ElementResult(
        float(strain[0]),
        float(strain[1]),
        float(strain[2]),
        float(strain[3] * 0.5),
        float(stress[0]),
        float(stress[1]),
        float(stress[2]),
        float(stress[3]),
        float(principal_max),
        float(principal_min),
        float(principal_difference),
        float(axis_angle),
        float(stress_optic_coefficient),
        float(signed_birefringence),
        float(local_birefringence),
        slow_axis_angle,
        area,
    )


def _normalise_unoriented_axis(angle: float) -> float:
    while angle >= math.pi / 2.0:
        angle -= math.pi
    while angle < -math.pi / 2.0:
        angle += math.pi
    return angle


def _slow_axis_angle(
    principal_axis_angle: float,
    principal_difference: float,
    stress_optic_coefficient: float,
) -> float | None:
    if (
        principal_difference <= _ZERO_STRESS_TOLERANCE_PA
        or abs(stress_optic_coefficient) <= _ZERO_COEFFICIENT_TOLERANCE_PER_PA
    ):
        return None
    slow_axis = principal_axis_angle
    if stress_optic_coefficient < 0.0:
        slow_axis += math.pi / 2.0
    return _normalise_unoriented_axis(slow_axis)


def _local_material_observables(
    principal_axis_angle: float,
    principal_difference: float,
    stress_optic_coefficient: float,
) -> tuple[float, float, float | None]:
    signed_birefringence = stress_optic_coefficient * principal_difference
    return (
        signed_birefringence,
        abs(signed_birefringence),
        _slow_axis_angle(
            principal_axis_angle,
            principal_difference,
            stress_optic_coefficient,
        ),
    )


def _core_summary(
    request: PandaThermalFemRequest,
    mesh: PandaMeshResult,
    elements: tuple[_ElementResult, ...],
) -> PandaThermalFemCoreSummary:
    core_indices = [
        index for index, region in enumerate(mesh.region_tags) if region is PandaMeshRegion.CORE
    ]
    area = sum(elements[index].area for index in core_indices)
    if area <= 0.0:
        raise PandaThermalFemCalculationError(
            "core_area_missing", "The selected mesh has no positive core area."
        )
    average = [
        sum(getattr(elements[index], name) * elements[index].area for index in core_indices) / area
        for name in ("stress_xx", "stress_yy", "stress_zz", "stress_xy")
    ]
    half_difference = 0.5 * (average[0] - average[1])
    radius = math.hypot(half_difference, average[3])
    principal_difference = 2.0 * radius
    principal_axis_angle = 0.5 * math.atan2(2.0 * average[3], average[0] - average[1])
    coefficient = stress_optic_coefficient_per_pa(request.materials.core)
    (
        signed_birefringence,
        local_birefringence,
        slow_axis_angle,
    ) = _local_material_observables(principal_axis_angle, principal_difference, coefficient)
    return PandaThermalFemCoreSummary(
        area_m2=area,
        average_stress_xx_pa=average[0],
        average_stress_yy_pa=average[1],
        average_stress_zz_pa=average[2],
        average_stress_xy_pa=average[3],
        principal_max_pa=average[0] * 0.5 + average[1] * 0.5 + radius,
        principal_min_pa=average[0] * 0.5 + average[1] * 0.5 - radius,
        principal_difference_pa=principal_difference,
        principal_axis_angle_rad=principal_axis_angle,
        stress_optic_coefficient_per_pa=coefficient,
        signed_local_material_birefringence=signed_birefringence,
        local_material_birefringence=local_birefringence,
        local_material_slow_axis_angle_rad=slow_axis_angle,
    )


def _solve_level(
    request: PandaThermalFemRequest,
    level: int,
    anchor_strategy: str = "centered",
) -> _Solve:
    mesh = generate_panda_mesh(request.mesh_request(level))
    skfem_mesh = MeshTri(
        np.asarray(mesh.nodes_m, dtype=float).T,
        np.asarray(mesh.elements, dtype=np.int64).T,
        sort_t=False,
    )
    if skfem_mesh.nelements != mesh.element_count:
        raise PandaThermalFemCalculationError(
            "mesh_adapter_failed", "The selected mesh is incompatible with scikit-fem."
        )
    basis = Basis(skfem_mesh, ElementTriP1())
    node_count = mesh.node_count
    anchor = _anchor_data(mesh, request, anchor_strategy)
    constraints = _constraint_matrix(node_count, anchor)
    axial_condition = request.axial_load.condition
    prescribed_strain = (
        request.axial_load.prescribed_strain
        if axial_condition is AxialCondition.PRESCRIBED_STRAIN
        else None
    )
    axial_target = (
        0.0
        if axial_condition is AxialCondition.FREE_RESULTANT
        else request.axial_load.prescribed_force_n
        if axial_condition is AxialCondition.PRESCRIBED_FORCE
        else None
    )
    matrix, load, element_cache = _assemble(
        request,
        mesh,
        basis,
        prescribed_strain,
        axial_target,
        request.geometry.cladding_radius_m,
    )
    if matrix.shape[0] == 2 * node_count + 1:
        constraints = bmat([[constraints, csc_matrix((constraints.shape[0], 1))]], format="csc")
    solution, multipliers = _solve_augmented(matrix, load, constraints)
    displacement = solution[: 2 * node_count]
    epsilon_zz = (
        float(prescribed_strain)
        if prescribed_strain is not None
        else float(solution[-1] / request.geometry.cladding_radius_m)
    )
    displacement_x = displacement[0::2]
    displacement_y = displacement[1::2]
    elements: list[_ElementResult] = []
    axial_resultant = 0.0
    for element_index, (b_displacement, area, constitutive, thermal_strain) in enumerate(
        element_cache
    ):
        nodes = mesh.elements[element_index]
        local_displacement = np.array(
            [value for node in nodes for value in (displacement_x[node], displacement_y[node])],
            dtype=float,
        )
        element = _element_result(
            b_displacement,
            area,
            constitutive,
            thermal_strain,
            local_displacement,
            epsilon_zz,
            stress_optic_coefficient_per_pa(
                _material_by_region(request, mesh.region_tags[element_index])
            ),
        )
        elements.append(element)
        axial_resultant += area * element.stress_zz
    elements_tuple = tuple(elements)
    core_summary = _core_summary(request, mesh, elements_tuple)
    equilibrium_residual = matrix @ solution - load + constraints.T @ multipliers
    transverse_residual = equilibrium_residual[: 2 * node_count]
    residual_norm = float(np.linalg.norm(transverse_residual))
    target_n = axial_target
    axial_residual = axial_resultant - target_n if target_n is not None else None
    primary_x = float(multipliers[0])
    primary_y = float(multipliers[1])
    secondary_x = float(multipliers[2] * anchor.normal_x)
    secondary_y = float(multipliers[2] * anchor.normal_y)
    resultant_x = primary_x + secondary_x
    resultant_y = primary_y + secondary_y
    return _Solve(
        mesh,
        displacement_x,
        displacement_y,
        epsilon_zz,
        elements_tuple,
        core_summary,
        PandaThermalFemAnchorReactions(
            primary_node_index=anchor.primary,
            secondary_node_index=anchor.secondary,
            primary_reaction_x_n_per_m=primary_x,
            primary_reaction_y_n_per_m=primary_y,
            secondary_reaction_x_n_per_m=secondary_x,
            secondary_reaction_y_n_per_m=secondary_y,
        ),
        PandaThermalFemForceBalance(
            transverse_free_residual_l2_n_per_m=residual_norm,
            transverse_resultant_x_n_per_m=resultant_x,
            transverse_resultant_y_n_per_m=resultant_y,
            axial_resultant_n=axial_resultant,
            axial_target_n=target_n,
            axial_residual_n=axial_residual,
        ),
    )


def _relative_change(current: float, previous: float) -> float:
    denominator = max(abs(current), abs(previous))
    if denominator == 0.0:
        return 0.0
    return abs(current - previous) / denominator


def _convergence(solutions: tuple[_Solve, ...]) -> tuple[PandaThermalFemConvergenceSummary, ...]:
    summaries: list[PandaThermalFemConvergenceSummary] = []
    previous_stress: float | None = None
    previous_birefringence: float | None = None
    for level, solution in enumerate(solutions):
        stress_value = solution.core_summary.principal_difference_pa
        birefringence_value = solution.core_summary.local_material_birefringence
        if previous_stress is None or previous_birefringence is None:
            summaries.append(
                PandaThermalFemConvergenceSummary(
                    refinement_level=level,
                    node_count=solution.mesh.node_count,
                    element_count=solution.mesh.element_count,
                    core_average_principal_difference_pa=stress_value,
                    relative_change=None,
                    status="unavailable",
                    core_average_local_material_birefringence=birefringence_value,
                    local_material_birefringence_relative_change=None,
                    local_material_birefringence_status="unavailable",
                )
            )
        else:
            stress_relative_change = _relative_change(stress_value, previous_stress)
            birefringence_relative_change = _relative_change(
                birefringence_value,
                previous_birefringence,
            )
            summaries.append(
                PandaThermalFemConvergenceSummary(
                    refinement_level=level,
                    node_count=solution.mesh.node_count,
                    element_count=solution.mesh.element_count,
                    core_average_principal_difference_pa=stress_value,
                    relative_change=stress_relative_change,
                    status=(
                        "converged"
                        if stress_relative_change <= _CONVERGENCE_THRESHOLD
                        else "not_converged"
                    ),
                    core_average_local_material_birefringence=birefringence_value,
                    local_material_birefringence_relative_change=birefringence_relative_change,
                    local_material_birefringence_status=(
                        "converged"
                        if birefringence_relative_change <= _CONVERGENCE_THRESHOLD
                        else "not_converged"
                    ),
                )
            )
        previous_stress = stress_value
        previous_birefringence = birefringence_value
    return tuple(summaries)


def _comparison(
    request: PandaThermalFemRequest,
    solution: _Solve,
) -> PandaThermalFemShapeComparison:
    core_indices = [
        index
        for index, region in enumerate(solution.mesh.region_tags)
        if region is PandaMeshRegion.CORE
    ]
    sample_count = len(core_indices)
    mismatch_strains = (
        (request.materials.sap_1.cte_per_k - request.materials.cladding.cte_per_k)
        * (request.thermal.effective_fictive_temperature_k - request.thermal.temperature_k),
        (request.materials.sap_2.cte_per_k - request.materials.cladding.cte_per_k)
        * (request.thermal.effective_fictive_temperature_k - request.thermal.temperature_k),
    )
    kernel_values: list[float] = []
    stress_values: list[float] = []
    nodes = np.asarray(solution.mesh.nodes_m, dtype=float)
    elements = np.asarray(solution.mesh.elements, dtype=np.int64)
    for index in core_indices:
        centroid = np.mean(nodes[elements[index]], axis=0)
        kernel, _ = qualitative_kernel_components_at(
            request.geometry,
            mismatch_strains,
            float(centroid[0]),
            float(centroid[1]),
        )
        element = solution.elements[index]
        kernel_values.append(kernel)
        stress_values.append(element.stress_xx - element.stress_yy)

    kernel_scale = max((abs(value) for value in kernel_values), default=0.0)
    stress_scale = max((abs(value) for value in stress_values), default=0.0)
    if (
        sample_count < 2
        or not math.isfinite(kernel_scale)
        or not math.isfinite(stress_scale)
        or kernel_scale <= 0.0
        or stress_scale <= 0.0
    ):
        reason: Literal["insufficient_core_elements", "zero_or_nonfinite_scale"] = (
            "insufficient_core_elements" if sample_count < 2 else "zero_or_nonfinite_scale"
        )
        return PandaThermalFemShapeComparison(
            sample_count=sample_count,
            available=False,
            kernel_scale=kernel_scale if math.isfinite(kernel_scale) else None,
            fem_signed_deviatoric_stress_scale_pa=stress_scale
            if math.isfinite(stress_scale)
            else None,
            best_polarity=None,
            rmse=None,
            correlation=None,
            sign_agreement=None,
            unavailable_reason=reason,
        )

    normalized_kernel = np.asarray(kernel_values, dtype=float) / kernel_scale
    normalized_stress = np.asarray(stress_values, dtype=float) / stress_scale
    if not np.all(np.isfinite(normalized_kernel)) or not np.all(np.isfinite(normalized_stress)):
        return PandaThermalFemShapeComparison(
            sample_count=sample_count,
            available=False,
            kernel_scale=kernel_scale,
            fem_signed_deviatoric_stress_scale_pa=stress_scale,
            best_polarity=None,
            rmse=None,
            correlation=None,
            sign_agreement=None,
            unavailable_reason="nonfinite_metric",
        )

    positive_error = float(np.sqrt(np.mean((normalized_stress - normalized_kernel) ** 2)))
    negative_error = float(np.sqrt(np.mean((normalized_stress + normalized_kernel) ** 2)))
    polarity: Literal[-1, 1] = -1 if negative_error < positive_error else 1
    aligned_kernel = polarity * normalized_kernel
    rmse = min(positive_error, negative_error)
    centered_kernel = aligned_kernel - float(np.mean(aligned_kernel))
    centered_stress = normalized_stress - float(np.mean(normalized_stress))
    denominator = float(np.linalg.norm(centered_kernel) * np.linalg.norm(centered_stress))
    correlation = (
        None
        if denominator <= 0.0
        else float(np.dot(centered_kernel, centered_stress) / denominator)
    )
    sign_agreement = float(
        np.mean(
            [
                math.copysign(1.0, float(kernel_value)) == math.copysign(1.0, float(stress_value))
                for kernel_value, stress_value in zip(
                    aligned_kernel, normalized_stress, strict=True
                )
            ]
        )
    )
    return PandaThermalFemShapeComparison(
        sample_count=sample_count,
        available=True,
        kernel_scale=kernel_scale,
        fem_signed_deviatoric_stress_scale_pa=stress_scale,
        best_polarity=polarity,
        rmse=rmse,
        correlation=correlation,
        sign_agreement=sign_agreement,
        unavailable_reason=None,
    )


def calculate_panda_thermal_fem(request: PandaThermalFemRequest) -> PandaThermalFemResult:
    solutions = tuple(_solve_level(request, level) for level in range(request.refinement_level + 1))
    selected = solutions[-1]
    convergence = _convergence(solutions)
    warnings = [
        PandaThermalFemWarning(
            code="convergence_unavailable",
            message="Level 0 is the first comparison mesh; convergence is unavailable there.",
            refinement_level=0,
        )
    ]
    if any(
        material.source.confidence is MaterialConfidence.DEMONSTRATION_ONLY
        for material in (
            request.materials.core,
            request.materials.cladding,
            request.materials.sap_1,
            request.materials.sap_2,
        )
    ):
        warnings.insert(
            0,
            PandaThermalFemWarning(
                code="demonstration_data",
                message="At least one material uses demonstration-only data.",
            ),
        )
    latest = convergence[-1]
    if latest.status == "not_converged":
        warnings.append(
            PandaThermalFemWarning(
                code="convergence_above_threshold",
                message="The latest core stress convergence change exceeds the 5% threshold.",
                refinement_level=latest.refinement_level,
            )
        )
    if latest.local_material_birefringence_status == "not_converged":
        warnings.append(
            PandaThermalFemWarning(
                code="local_material_birefringence_convergence_above_threshold",
                message=(
                    "The latest core local-material birefringence convergence change exceeds "
                    "the 5% threshold."
                ),
                refinement_level=latest.refinement_level,
            )
        )
    return PandaThermalFemResult(
        configuration=request,
        mesh=selected.mesh,
        displacement_x_m=tuple(float(value) for value in selected.displacement_x),
        displacement_y_m=tuple(float(value) for value in selected.displacement_y),
        element_strain_xx=tuple(element.strain_xx for element in selected.elements),
        element_strain_yy=tuple(element.strain_yy for element in selected.elements),
        element_strain_zz=tuple(element.strain_zz for element in selected.elements),
        element_strain_xy=tuple(element.strain_xy for element in selected.elements),
        element_stress_xx_pa=tuple(element.stress_xx for element in selected.elements),
        element_stress_yy_pa=tuple(element.stress_yy for element in selected.elements),
        element_stress_zz_pa=tuple(element.stress_zz for element in selected.elements),
        element_stress_xy_pa=tuple(element.stress_xy for element in selected.elements),
        element_principal_max_pa=tuple(element.principal_max for element in selected.elements),
        element_principal_min_pa=tuple(element.principal_min for element in selected.elements),
        element_principal_difference_pa=tuple(
            element.principal_difference for element in selected.elements
        ),
        element_principal_axis_angle_rad=tuple(
            element.principal_axis_angle for element in selected.elements
        ),
        element_stress_optic_coefficient_per_pa=tuple(
            element.stress_optic_coefficient for element in selected.elements
        ),
        element_signed_local_material_birefringence=tuple(
            element.signed_local_material_birefringence for element in selected.elements
        ),
        element_local_material_birefringence=tuple(
            element.local_material_birefringence for element in selected.elements
        ),
        element_local_material_slow_axis_angle_rad=tuple(
            element.local_material_slow_axis_angle for element in selected.elements
        ),
        epsilon_zz_0=selected.epsilon_zz,
        core_summary=selected.core_summary,
        anchor_reactions=selected.anchors,
        force_balance=selected.force_balance,
        convergence=convergence,
        qualitative_kernel_fem_shape_comparison=_comparison(request, selected),
        warnings=tuple(warnings),
        model_manifest=PandaThermalFemManifest(),
    )


__all__ = ["calculate_panda_thermal_fem"]
