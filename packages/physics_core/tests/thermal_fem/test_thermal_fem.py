import inspect
import math
import tracemalloc

import numpy as np
import pytest
from pydantic import ValidationError

from fibre_sim.panda_mesh import PandaMeshRegion
from fibre_sim.photoelastic import (
    AxialCondition,
    AxialLoad,
    CircularSAP,
    MaterialConfidence,
    MaterialSource,
    PandaGeometry,
    PandaMaterial,
    PandaMaterialSet,
    PhotoelasticConvention,
    ThermalState,
    photoelastic_coefficients_per_pa,
    photoelastic_index_perturbation_matrix,
    stress_optic_coefficient_per_pa,
)
from fibre_sim.thermal_fem import (
    PandaThermalFemConvergenceSummary,
    PandaThermalFemRequest,
    PandaThermalFemResult,
    PandaTorsionRequest,
    TorsionCapability,
    TorsionInputMode,
    calculate_panda_thermal_fem,
    rotate_perturbation_matrix,
    scalar_lp01_modal_estimate_from_matrix,
)
from fibre_sim.thermal_fem.calculations import (
    _local_material_observables,
    _relative_change,
    _solve_level,
    _thermal_strain,
)


def geometry(
    *,
    sap_1: CircularSAP | None = None,
    sap_2: CircularSAP | None = None,
) -> PandaGeometry:
    return PandaGeometry(
        core_radius_m=4.1e-6,
        cladding_radius_m=62.5e-6,
        core_center_x_m=0.0,
        core_center_y_m=0.0,
        sap_1=sap_1 or CircularSAP(radius_m=17.0e-6, center_x_m=-32.0e-6, center_y_m=0.0),
        sap_2=sap_2 or CircularSAP(radius_m=17.0e-6, center_x_m=32.0e-6, center_y_m=0.0),
    )


def rotated_geometry(model_geometry: PandaGeometry, angle_rad: float) -> PandaGeometry:
    cosine = math.cos(angle_rad)
    sine = math.sin(angle_rad)

    def rotate(x_m: float, y_m: float) -> tuple[float, float]:
        return cosine * x_m - sine * y_m, sine * x_m + cosine * y_m

    core_x, core_y = rotate(
        model_geometry.core_center_x_m,
        model_geometry.core_center_y_m,
    )
    sap_1_x, sap_1_y = rotate(
        model_geometry.sap_1.center_x_m,
        model_geometry.sap_1.center_y_m,
    )
    sap_2_x, sap_2_y = rotate(
        model_geometry.sap_2.center_x_m,
        model_geometry.sap_2.center_y_m,
    )
    return PandaGeometry(
        core_radius_m=model_geometry.core_radius_m,
        cladding_radius_m=model_geometry.cladding_radius_m,
        core_center_x_m=core_x,
        core_center_y_m=core_y,
        sap_1=CircularSAP(
            radius_m=model_geometry.sap_1.radius_m,
            center_x_m=sap_1_x,
            center_y_m=sap_1_y,
        ),
        sap_2=CircularSAP(
            radius_m=model_geometry.sap_2.radius_m,
            center_x_m=sap_2_x,
            center_y_m=sap_2_y,
        ),
    )


def material(
    name: str, young_modulus_pa: float, poisson_ratio: float, cte_per_k: float
) -> PandaMaterial:
    return PandaMaterial(
        name=name,
        young_modulus_pa=young_modulus_pa,
        poisson_ratio=poisson_ratio,
        cte_per_k=cte_per_k,
        refractive_index=1.45,
        p11=0.12,
        p12=0.27,
        photoelastic_convention=PhotoelasticConvention.P11_P12_STRAIN,
        source=MaterialSource(
            citation="Step 2.6 test data",
            confidence=MaterialConfidence.DEMONSTRATION_ONLY,
        ),
    )


def materials(*, equal_cte: bool = False) -> PandaMaterialSet:
    return PandaMaterialSet(
        core=material("core", 72.0e9, 0.17, 5.0e-7),
        cladding=material("cladding", 70.0e9, 0.20, 5.0e-7 if equal_cte else 5.5e-7),
        sap_1=material("sap_1", 80.0e9, 0.23, 5.0e-7 if equal_cte else 8.0e-6),
        sap_2=material("sap_2", 90.0e9, 0.10, 5.0e-7 if equal_cte else 7.0e-6),
    )


def homogeneous_materials() -> PandaMaterialSet:
    shared = material("homogeneous", 70.0e9, 0.20, 5.5e-7)
    return PandaMaterialSet(
        core=shared,
        cladding=shared,
        sap_1=shared,
        sap_2=shared,
    )


def c1_c2_material() -> PandaMaterial:
    return PandaMaterial(
        name="stress-optic",
        young_modulus_pa=70.0e9,
        poisson_ratio=0.2,
        cte_per_k=5.5e-7,
        refractive_index=1.45,
        c1_per_pa=2.0e-12,
        c2_per_pa=-0.5e-12,
        photoelastic_convention=PhotoelasticConvention.C1_C2_STRESS_OPTIC,
        source=MaterialSource(
            citation="Step 2.7 test data",
            confidence=MaterialConfidence.DEMONSTRATION_ONLY,
        ),
    )


def request(
    *,
    axial_condition: AxialCondition = AxialCondition.FREE_RESULTANT,
    temperature_k: float = 293.0,
    fictive_temperature_k: float = 1000.0,
    prescribed_force_n: float | None = None,
    prescribed_strain: float | None = None,
    refinement_level: int = 0,
    model_geometry: PandaGeometry | None = None,
    model_materials: PandaMaterialSet | None = None,
) -> PandaThermalFemRequest:
    return PandaThermalFemRequest(
        geometry=model_geometry or geometry(),
        materials=model_materials or materials(),
        thermal=ThermalState(
            temperature_k=temperature_k,
            effective_fictive_temperature_k=fictive_temperature_k,
        ),
        axial_load=AxialLoad(
            condition=axial_condition,
            prescribed_force_n=prescribed_force_n,
            prescribed_strain=prescribed_strain,
        ),
        refinement_level=refinement_level,
    )


def test_homogeneous_free_cooling_has_near_zero_stress() -> None:
    result = calculate_panda_thermal_fem(request(model_materials=materials(equal_cte=True)))

    assert max(abs(value) for value in result.element_stress_xx_pa) < 1.0e-2
    assert max(abs(value) for value in result.element_stress_yy_pa) < 1.0e-2
    assert max(abs(value) for value in result.element_stress_zz_pa) < 1.0e-2
    assert max(abs(value) for value in result.element_stress_xy_pa) < 1.0e-2


def test_equal_cte_has_near_zero_stress_with_different_elastic_constants() -> None:
    result = calculate_panda_thermal_fem(
        request(model_materials=materials(equal_cte=True), temperature_k=280.0)
    )

    assert result.core_summary.principal_difference_pa < 1.0e-2
    assert max(abs(value) for value in result.element_stress_zz_pa) < 1.0e-2


def test_free_resultant_is_zero() -> None:
    result = calculate_panda_thermal_fem(request())

    assert result.force_balance.axial_target_n == pytest.approx(0.0)
    assert result.force_balance.axial_resultant_n == pytest.approx(0.0, abs=1.0e-8)
    assert result.force_balance.axial_residual_n == pytest.approx(0.0, abs=1.0e-8)


def test_prescribed_force_matches_target() -> None:
    target = 0.1
    result = calculate_panda_thermal_fem(
        request(
            axial_condition=AxialCondition.PRESCRIBED_FORCE,
            prescribed_force_n=target,
        )
    )

    assert result.force_balance.axial_target_n == pytest.approx(target)
    assert result.force_balance.axial_resultant_n == pytest.approx(target, abs=1.0e-8)
    assert result.force_balance.axial_residual_n == pytest.approx(0.0, abs=1.0e-8)


def test_prescribed_strain_is_fixed_without_axial_target_equation() -> None:
    strain = 2.0e-4
    result = calculate_panda_thermal_fem(
        request(
            axial_condition=AxialCondition.PRESCRIBED_STRAIN,
            prescribed_strain=strain,
            temperature_k=293.0,
            fictive_temperature_k=293.0,
        )
    )

    assert result.epsilon_zz_0 == pytest.approx(strain)
    assert result.force_balance.axial_target_n is None
    assert result.force_balance.axial_residual_n is None
    assert abs(result.force_balance.axial_resultant_n) > 1.0e-4


def test_homogeneous_prescribed_strain_matches_uniaxial_solution() -> None:
    strain = 2.0e-4
    model_request = request(
        axial_condition=AxialCondition.PRESCRIBED_STRAIN,
        prescribed_strain=strain,
        temperature_k=293.0,
        fictive_temperature_k=293.0,
        model_materials=homogeneous_materials(),
    )
    result = calculate_panda_thermal_fem(model_request)
    mesh_area = sum(summary.total_area_m2 for summary in result.mesh.region_summaries)

    assert result.force_balance.axial_resultant_n == pytest.approx(
        70.0e9 * strain * mesh_area,
        rel=1.0e-10,
    )
    assert max(abs(value) for value in result.element_stress_xx_pa) < 1.0e-3
    assert max(abs(value) for value in result.element_stress_yy_pa) < 1.0e-3
    assert tuple(result.element_stress_zz_pa) == pytest.approx(
        (70.0e9 * strain,) * result.mesh.element_count,
        rel=1.0e-10,
    )


def test_zero_temperature_difference_has_zero_field() -> None:
    result = calculate_panda_thermal_fem(request(temperature_k=293.0, fictive_temperature_k=293.0))

    assert max(abs(value) for value in result.displacement_x_m) < 1.0e-18
    assert max(abs(value) for value in result.displacement_y_m) < 1.0e-18
    assert max(abs(value) for value in result.element_stress_xx_pa) < 1.0e-4
    assert max(abs(value) for value in result.element_strain_xy) < 1.0e-18


def test_isotropic_thermal_strain_has_no_shear_component() -> None:
    strain = _thermal_strain(8.0e-6, -700.0)

    assert tuple(strain) == pytest.approx((-0.0056, -0.0056, -0.0056, 0.0))


def test_stress_optic_coefficient_supports_both_conventions() -> None:
    strain_material = material("strain", 70.0e9, 0.2, 5.5e-7)
    expected = 1.45**3 * 1.2 * (0.27 - 0.12) / (2.0 * 70.0e9)

    assert stress_optic_coefficient_per_pa(strain_material) == pytest.approx(expected)
    assert stress_optic_coefficient_per_pa(c1_c2_material()) == pytest.approx(2.5e-12)


def test_photoelastic_coefficients_and_hermitian_matrix_follow_selected_convention() -> None:
    strain_material = material("strain", 70.0e9, 0.2, 5.5e-7)
    c1, c2, csigma = photoelastic_coefficients_per_pa(strain_material)
    assert c1 == pytest.approx(-(1.45**3) * (0.12 - 2.0 * 0.2 * 0.27) / (2.0 * 70.0e9))
    assert c2 == pytest.approx(-(1.45**3) * (0.8 * 0.27 - 0.2 * 0.12) / (2.0 * 70.0e9))
    assert csigma == pytest.approx(c1 - c2)

    matrix = photoelastic_index_perturbation_matrix(strain_material, 2.0, 3.0, 5.0, 7.0)
    assert matrix[0][1] == pytest.approx(matrix[1][0])
    assert matrix[0][0] == pytest.approx(c1 * 2.0 + c2 * (3.0 + 5.0))
    assert matrix[1][1] == pytest.approx(c1 * 3.0 + c2 * (2.0 + 5.0))
    assert matrix[0][1] == pytest.approx(csigma * 7.0)

    direct_c1, direct_c2, direct_csigma = photoelastic_coefficients_per_pa(c1_c2_material())
    assert (direct_c1, direct_c2, direct_csigma) == pytest.approx((2.0e-12, -0.5e-12, 2.5e-12))


def test_pressure_increment_is_zero_at_zero_pressure_and_metadata_is_explicit() -> None:
    result = calculate_panda_thermal_fem(request())

    assert result.model_manifest.exterior_boundary_model == (
        "traction_free_at_zero_pressure_or_prescribed_bare_glass_lateral_pressure"
    )
    assert result.model_manifest.free_resultant_scope == "ends_not_pressure_loaded"
    assert result.model_manifest.hydrostatic_end_face_loading == (
        "requires_changed_axial_loading_condition"
    )
    assert result.model_manifest.hydrostatic_limitation == (
        "pressure_on_end_faces_requires_changing_the_axial_loading_condition"
    )
    assert result.optical_birefringence.pressure_induced.phase_birefringence_magnitude == 0.0
    assert result.optical_birefringence.pressure_induced.signed_phase_birefringence == 0.0
    assert result.optical_birefringence.pressure_induced.signed_delta_beta_per_m == 0.0
    assert result.optical_birefringence.pressure_induced.beat_length_m is None
    assert (
        result.optical_birefringence.pressure_induced.beat_length_status
        == "undefined within numerical tolerance"
    )
    assert all(value == 0.0 for value in result.element_pressure_increment_stress_xx_pa)
    assert all(value == 0.0 for value in result.element_pressure_increment_stress_yy_pa)
    assert all(value == 0.0 for value in result.element_pressure_increment_stress_zz_pa)
    assert all(value == 0.0 for value in result.element_pressure_increment_stress_xy_pa)


def test_lateral_pressure_is_compressive_and_increment_is_total_minus_baseline() -> None:
    baseline = calculate_panda_thermal_fem(
        request(temperature_k=293.0, fictive_temperature_k=293.0)
    )
    pressured = calculate_panda_thermal_fem(
        request(temperature_k=293.0, fictive_temperature_k=293.0).model_copy(
            update={"lateral_pressure_pa": 1.0e6}
        )
    )

    assert pressured.pressure_increment_core_summary.average_stress_xx_pa < 0.0
    assert pressured.pressure_increment_core_summary.average_stress_yy_pa < 0.0
    assert pressured.optical_birefringence.pressure_induced.phase_birefringence_magnitude >= 0.0
    for totals, initial_values, increments in (
        (
            pressured.element_stress_xx_pa,
            baseline.element_stress_xx_pa,
            pressured.element_pressure_increment_stress_xx_pa,
        ),
        (
            pressured.element_stress_yy_pa,
            baseline.element_stress_yy_pa,
            pressured.element_pressure_increment_stress_yy_pa,
        ),
        (
            pressured.element_stress_zz_pa,
            baseline.element_stress_zz_pa,
            pressured.element_pressure_increment_stress_zz_pa,
        ),
        (
            pressured.element_stress_xy_pa,
            baseline.element_stress_xy_pa,
            pressured.element_pressure_increment_stress_xy_pa,
        ),
    ):
        for total, initial, increment in zip(totals, initial_values, increments, strict=True):
            assert increment == pytest.approx(total - initial)


def test_homogeneous_control_pressure_changes_common_phase_without_linear_split() -> None:
    model_request = request(
        model_materials=homogeneous_materials(),
        temperature_k=293.0,
        fictive_temperature_k=293.0,
    ).model_copy(update={"lateral_pressure_pa": 1.0e6})
    result = calculate_panda_thermal_fem(model_request)
    pressure_estimate = result.optical_birefringence.pressure_induced

    assert result.pressure_increment_core_summary.average_stress_xx_pa == pytest.approx(
        -1.0e6, abs=1.0e-5
    )
    assert result.pressure_increment_core_summary.average_stress_yy_pa == pytest.approx(
        -1.0e6, abs=1.0e-5
    )
    assert result.pressure_increment_core_summary.average_stress_zz_pa == pytest.approx(
        0.0, abs=1.0e-5
    )
    assert pressure_estimate.phase_birefringence_magnitude <= max(
        1.0e-15, abs(pressure_estimate.common_index_shift) * 1.0e-10
    )
    assert pressure_estimate.common_index_shift != 0.0


def test_total_and_pressure_modal_results_are_separate_matrix_perturbations() -> None:
    result = calculate_panda_thermal_fem(
        request().model_copy(update={"lateral_pressure_pa": 1.0e6})
    )
    optical = result.optical_birefringence

    assert optical.method == "First-order scalar LP₀₁ photoelastic phase-birefringence estimate."
    assert optical.zero_pressure_residual is not optical.total_combined
    assert optical.pressure_induced is not optical.total_combined
    for row in range(2):
        for column in range(2):
            assert optical.total_combined.perturbation_matrix[row][column] == pytest.approx(
                optical.zero_pressure_residual.perturbation_matrix[row][column]
                + optical.pressure_induced.perturbation_matrix[row][column]
            )


def test_modal_matrix_eigenvalues_are_invariant_when_basis_and_reference_axis_rotate() -> None:
    matrix = np.array(((2.0e-6, 0.4e-6), (0.4e-6, -1.0e-6)))
    angle = 0.37
    original = scalar_lp01_modal_estimate_from_matrix(matrix, 1.55e-6)
    matrix_tuple = (
        (float(matrix[0, 0]), float(matrix[0, 1])),
        (float(matrix[1, 0]), float(matrix[1, 1])),
    )
    rotated = scalar_lp01_modal_estimate_from_matrix(
        np.array(rotate_perturbation_matrix(matrix_tuple, angle)),
        1.55e-6,
        reference_axis_angle_rad=-angle,
    )
    assert rotated.eigenvalue_shifts == pytest.approx(original.eigenvalue_shifts)
    assert rotated.signed_phase_birefringence == pytest.approx(original.signed_phase_birefringence)


def test_modal_beat_length_and_group_result_are_limited_to_phase_estimate() -> None:
    result = calculate_panda_thermal_fem(
        request().model_copy(update={"lateral_pressure_pa": 1.0e6})
    )
    pressure = result.optical_birefringence.pressure_induced
    assert pressure.beat_length_m == pytest.approx(
        request().optical_mode.wavelength_m / pressure.phase_birefringence_magnitude
    )
    assert pressure.beat_length_status == "finite"
    assert result.optical_birefringence.group_birefringence.available is False
    assert result.optical_birefringence.group_birefringence.value is None


def test_doubled_wavelength_doubles_beat_length_for_a_fixed_modal_matrix() -> None:
    matrix = np.array(((2.0e-6, 0.4e-6), (0.4e-6, -1.0e-6)))
    first = scalar_lp01_modal_estimate_from_matrix(matrix, 1.31e-6)
    second = scalar_lp01_modal_estimate_from_matrix(matrix, 2.62e-6)

    assert second.phase_birefringence_magnitude == pytest.approx(
        first.phase_birefringence_magnitude
    )
    assert first.beat_length_m is not None
    assert second.beat_length_m == pytest.approx(2.0 * first.beat_length_m)
    assert second.signed_delta_beta_per_m == pytest.approx(0.5 * first.signed_delta_beta_per_m)


def test_torsion_reference_supports_twist_torque_and_zero_inputs() -> None:
    zero = calculate_panda_thermal_fem(request())
    assert max(abs(value) for value in zero.torsion.element_centroid_stress_xz_pa) == 0.0
    assert max(abs(value) for value in zero.torsion.element_centroid_stress_yz_pa) == 0.0

    twist_request = request().model_copy(
        update={
            "torsion": PandaTorsionRequest(
                capability=TorsionCapability.SAINT_VENANT_HOMOGENEOUS_CIRCULAR_REFERENCE,
                input_mode=TorsionInputMode.TWIST_RATE,
                twist_rate_per_m=2.0e3,
            )
        }
    )
    twist_result = calculate_panda_thermal_fem(twist_request)
    radius = twist_request.geometry.cladding_radius_m
    expected_j = math.pi * radius**4 / 2.0
    assert twist_result.torsion.polar_moment_m4 == pytest.approx(expected_j)
    assert twist_result.torsion.applied_torque_n_m == pytest.approx(
        twist_result.torsion.shear_modulus_pa * expected_j * 2.0e3
    )
    assert twist_result.torsion.analytical_mechanics_benchmark_only is True
    assert twist_result.torsion.heterogeneous_panda_torsion is False
    assert twist_result.torsion.polarization_coupling_included is False
    assert twist_result.torsion.used_in_transverse_scalar_optical_model is False
    assert twist_result.torsion.maximum_boundary_shear_pa == pytest.approx(
        twist_result.torsion.shear_modulus_pa * 2.0e3 * radius
    )
    nodes = np.asarray(twist_result.mesh.nodes_m, dtype=float)
    first_element = np.asarray(twist_result.mesh.elements[0], dtype=np.int64)
    center_x, center_y = np.mean(nodes[first_element], axis=0)
    assert twist_result.torsion.element_centroid_stress_xz_pa[0] == pytest.approx(
        -twist_result.torsion.shear_modulus_pa * 2.0e3 * center_y
    )
    assert twist_result.torsion.element_centroid_stress_yz_pa[0] == pytest.approx(
        twist_result.torsion.shear_modulus_pa * 2.0e3 * center_x
    )

    torque_request = twist_request.model_copy(
        update={
            "torsion": PandaTorsionRequest(
                capability=TorsionCapability.SAINT_VENANT_HOMOGENEOUS_CIRCULAR_REFERENCE,
                input_mode=TorsionInputMode.APPLIED_TORQUE,
                applied_torque_n_m=twist_result.torsion.applied_torque_n_m,
            )
        }
    )
    torque_result = calculate_panda_thermal_fem(torque_request)
    assert torque_result.torsion.twist_rate_per_m == pytest.approx(2.0e3)
    assert torque_result.torsion.element_centroid_stress_xz_pa == pytest.approx(
        twist_result.torsion.element_centroid_stress_xz_pa
    )
    assert torque_result.torsion.element_centroid_stress_yz_pa == pytest.approx(
        twist_result.torsion.element_centroid_stress_yz_pa
    )


def test_pressure_induced_phase_split_reports_mesh_convergence() -> None:
    result = calculate_panda_thermal_fem(
        request(refinement_level=1).model_copy(update={"lateral_pressure_pa": 1.0e6})
    )
    coarse, refined = result.convergence

    assert coarse.pressure_induced_phase_birefringence_status == "unavailable"
    assert coarse.pressure_induced_phase_birefringence_relative_change is None
    assert refined.pressure_induced_phase_birefringence_status in {
        "converged",
        "not_converged",
    }
    assert refined.pressure_induced_phase_birefringence_relative_change is not None
    assert math.isfinite(refined.pressure_induced_phase_birefringence_relative_change)
    assert refined.pressure_induced_phase_birefringence == pytest.approx(
        result.optical_birefringence.pressure_induced.phase_birefringence_magnitude
    )


def test_near_zero_pressure_split_converges_within_numerical_tolerance() -> None:
    result = calculate_panda_thermal_fem(
        request(
            refinement_level=1,
            model_materials=homogeneous_materials(),
        ).model_copy(update={"lateral_pressure_pa": 1.0e6})
    )
    coarse, refined = result.convergence

    assert coarse.pressure_induced_phase_birefringence <= 1.0e-15
    assert refined.pressure_induced_phase_birefringence <= 1.0e-15
    assert refined.pressure_induced_phase_birefringence_status == "converged"
    assert refined.pressure_induced_phase_birefringence_relative_change == 0.0
    assert not any(
        warning.code == "pressure_phase_birefringence_convergence_above_threshold"
        for warning in result.warnings
    )


def test_hydrostatic_stress_has_zero_local_material_birefringence() -> None:
    signed, magnitude, axis = _local_material_observables(0.35, 0.0, 2.0e-12)

    assert signed == 0.0
    assert magnitude == 0.0
    assert axis is None


def test_x_y_swap_preserves_local_material_birefringence_magnitude() -> None:
    first = _local_material_observables(0.2, 4.0e6, 2.0e-12)
    swapped = _local_material_observables(0.2 + math.pi / 2.0, 4.0e6, 2.0e-12)

    assert first[1] == pytest.approx(swapped[1])


def test_slow_axis_follows_stress_or_rotates_for_coefficient_polarity() -> None:
    positive = _local_material_observables(0.25, 4.0e6, 2.0e-12)
    negative = _local_material_observables(0.25, 4.0e6, -2.0e-12)

    assert positive[2] == pytest.approx(0.25)
    assert negative[2] == pytest.approx(0.25 - math.pi / 2.0)


def test_zero_stress_or_zero_coefficient_has_no_slow_axis() -> None:
    assert _local_material_observables(0.25, 0.0, 2.0e-12)[2] is None
    assert _local_material_observables(0.25, 4.0e6, 0.0)[2] is None


def test_relative_convergence_change_is_scale_invariant() -> None:
    assert _relative_change(4.0e6, 5.0e6) == pytest.approx(0.2)
    assert _relative_change(4.0e-6, 5.0e-6) == pytest.approx(0.2)
    assert _relative_change(0.0, 0.0) == 0.0


def test_refined_convergence_rejects_unavailable_status() -> None:
    with pytest.raises(ValidationError, match="available convergence states"):
        PandaThermalFemConvergenceSummary(
            refinement_level=1,
            node_count=10,
            element_count=12,
            core_average_principal_difference_pa=1.0,
            relative_change=0.1,
            status="unavailable",
            core_average_local_material_birefringence=1.0e-6,
            local_material_birefringence_relative_change=0.1,
            local_material_birefringence_status="unavailable",
        )


def test_sap_permutation_preserves_core_summary() -> None:
    original = request()
    swapped_geometry = geometry(sap_1=original.geometry.sap_2, sap_2=original.geometry.sap_1)
    swapped_materials = PandaMaterialSet(
        core=original.materials.core,
        cladding=original.materials.cladding,
        sap_1=original.materials.sap_2,
        sap_2=original.materials.sap_1,
    )
    swapped = request(
        model_geometry=swapped_geometry,
        model_materials=swapped_materials,
    )

    first_result = calculate_panda_thermal_fem(original)
    swapped_result = calculate_panda_thermal_fem(swapped)

    assert swapped_result.epsilon_zz_0 == pytest.approx(first_result.epsilon_zz_0)
    assert swapped_result.core_summary.principal_difference_pa == pytest.approx(
        first_result.core_summary.principal_difference_pa,
        rel=1.0e-9,
    )
    assert (
        swapped_result.optical_birefringence.zero_pressure_residual.phase_birefringence_magnitude
        == pytest.approx(
            first_result.optical_birefringence.zero_pressure_residual.phase_birefringence_magnitude,
            rel=1.0e-9,
        )
    )


def test_global_fem_rotation_preserves_modal_magnitude_and_rotates_axis() -> None:
    angle = math.pi / 2.0
    original_request = request()
    rotated_request = request(
        model_geometry=rotated_geometry(original_request.geometry, angle),
    )

    original = calculate_panda_thermal_fem(original_request)
    rotated = calculate_panda_thermal_fem(rotated_request)
    first = original.optical_birefringence.zero_pressure_residual
    second = rotated.optical_birefringence.zero_pressure_residual

    assert second.phase_birefringence_magnitude == pytest.approx(
        first.phase_birefringence_magnitude,
        rel=0.03,
    )
    assert second.signed_phase_birefringence == pytest.approx(
        -first.signed_phase_birefringence,
        rel=0.03,
    )
    assert first.slow_axis_angle_rad is not None
    assert second.slow_axis_angle_rad is not None
    axis_error = (
        second.slow_axis_angle_rad - first.slow_axis_angle_rad - angle + math.pi / 2.0
    ) % math.pi - math.pi / 2.0
    assert axis_error == pytest.approx(0.0, abs=0.03)


def test_anchor_strategy_does_not_change_stress() -> None:
    model_request = request()
    centered = _solve_level(model_request, 0, "centered")
    alternate = _solve_level(model_request, 0, "alternate")

    assert centered.anchors.primary_node_index != alternate.anchors.primary_node_index
    assert centered.core_summary.principal_difference_pa == pytest.approx(
        alternate.core_summary.principal_difference_pa,
        rel=1.0e-8,
    )
    assert tuple(item.stress_xx for item in centered.elements) == pytest.approx(
        tuple(item.stress_xx for item in alternate.elements), rel=1.0e-8, abs=1.0e-3
    )


def test_stress_strain_relation_and_principal_values() -> None:
    model_request = request()
    result = calculate_panda_thermal_fem(model_request)
    index = 0
    region = result.mesh.region_tags[index]
    model_material = {
        PandaMeshRegion.CORE: model_request.materials.core,
        PandaMeshRegion.CLADDING: model_request.materials.cladding,
        PandaMeshRegion.SAP_1: model_request.materials.sap_1,
        PandaMeshRegion.SAP_2: model_request.materials.sap_2,
    }[region]
    young = model_material.young_modulus_pa
    poisson = model_material.poisson_ratio
    mu = young / (2.0 * (1.0 + poisson))
    lam = young * poisson / ((1.0 + poisson) * (1.0 - 2.0 * poisson))
    eth = model_material.cte_per_k * (
        model_request.thermal.temperature_k - model_request.thermal.effective_fictive_temperature_k
    )
    exx = result.element_strain_xx[index]
    eyy = result.element_strain_yy[index]
    ezz = result.element_strain_zz[index]
    exy = result.element_strain_xy[index]
    trace = exx + eyy + ezz - 3.0 * eth

    assert result.element_stress_xx_pa[index] == pytest.approx(2.0 * mu * (exx - eth) + lam * trace)
    assert result.element_stress_xy_pa[index] == pytest.approx(2.0 * mu * exy)
    half_difference = 0.5 * (
        result.element_stress_xx_pa[index] - result.element_stress_yy_pa[index]
    )
    radius = math.hypot(half_difference, result.element_stress_xy_pa[index])
    assert result.element_principal_max_pa[index] == pytest.approx(
        0.5 * (result.element_stress_xx_pa[index] + result.element_stress_yy_pa[index]) + radius
    )
    assert result.element_principal_difference_pa[index] == pytest.approx(2.0 * radius)


def test_force_balance_output_is_small_and_anchor_reactions_are_reported() -> None:
    result = calculate_panda_thermal_fem(request())

    assert result.force_balance.transverse_free_residual_l2_n_per_m < 1.0e-6
    assert result.force_balance.transverse_resultant_x_n_per_m == pytest.approx(0.0, abs=1.0e-7)
    assert result.force_balance.transverse_resultant_y_n_per_m == pytest.approx(0.0, abs=1.0e-7)
    assert (
        result.anchor_reactions.primary_node_index != result.anchor_reactions.secondary_node_index
    )


def test_output_counts_and_values_are_finite() -> None:
    result = calculate_panda_thermal_fem(request())

    assert len(result.displacement_x_m) == result.mesh.node_count
    assert len(result.element_stress_xx_pa) == result.mesh.element_count
    assert all(math.isfinite(value) for value in result.displacement_x_m)
    assert all(math.isfinite(value) for value in result.element_principal_difference_pa)
    assert result.model_manifest.birefringence_computed is True
    assert result.model_manifest.local_not_modal is True
    assert all(
        value is None or -math.pi / 2.0 <= value < math.pi / 2.0
        for value in result.element_local_material_slow_axis_angle_rad
    )


def test_element_region_coefficients_follow_material_regions() -> None:
    model_request = request()
    result = calculate_panda_thermal_fem(model_request)
    expected = {
        PandaMeshRegion.CORE: stress_optic_coefficient_per_pa(model_request.materials.core),
        PandaMeshRegion.CLADDING: stress_optic_coefficient_per_pa(model_request.materials.cladding),
        PandaMeshRegion.SAP_1: stress_optic_coefficient_per_pa(model_request.materials.sap_1),
        PandaMeshRegion.SAP_2: stress_optic_coefficient_per_pa(model_request.materials.sap_2),
    }

    for index, region in enumerate(result.mesh.region_tags):
        assert result.element_stress_optic_coefficient_per_pa[index] == pytest.approx(
            expected[region]
        )


def test_equal_cte_makes_kernel_fem_shape_comparison_unavailable() -> None:
    result = calculate_panda_thermal_fem(request(model_materials=materials(equal_cte=True)))
    comparison = result.qualitative_kernel_fem_shape_comparison

    assert comparison.available is False
    assert comparison.unavailable_reason == "zero_or_nonfinite_scale"
    assert comparison.rmse is None


def test_kernel_fem_shape_comparison_is_bounded_and_non_quantitative() -> None:
    comparison = calculate_panda_thermal_fem(request()).qualitative_kernel_fem_shape_comparison

    assert comparison.available is True
    assert comparison.sample_count >= 2
    assert comparison.best_polarity in (-1, 1)
    assert comparison.rmse is not None and 0.0 <= comparison.rmse <= 2.0
    assert comparison.correlation is None or -1.0 <= comparison.correlation <= 1.0
    assert comparison.sign_agreement is not None and 0.0 <= comparison.sign_agreement <= 1.0
    assert comparison.quantitative is False
    assert "birefringence error" in " ".join(comparison.limitations)


def test_convergence_has_counts_and_level_zero_status() -> None:
    result = calculate_panda_thermal_fem(request(refinement_level=1))

    assert len(result.convergence) == 2
    assert result.convergence[0].status == "unavailable"
    assert result.convergence[0].relative_change is None
    assert result.convergence[0].local_material_birefringence_relative_change is None
    assert result.convergence[0].local_material_birefringence_status == "unavailable"
    assert result.convergence[0].node_count < result.convergence[1].node_count
    assert result.convergence[0].element_count < result.convergence[1].element_count
    assert result.warnings[1].code == "convergence_unavailable"


def test_repeat_is_deterministic() -> None:
    model_request = request()

    first = calculate_panda_thermal_fem(model_request)
    second = calculate_panda_thermal_fem(model_request)

    assert first.model_dump_json() == second.model_dump_json()


def test_request_and_result_are_strict() -> None:
    with pytest.raises(ValidationError):
        PandaThermalFemRequest.model_validate(
            {
                "geometry": geometry().model_dump(),
                "materials": materials().model_dump(),
                "thermal": ThermalState(
                    temperature_k=293.0,
                    effective_fictive_temperature_k=1000.0,
                ).model_dump(),
                "axial_load": AxialLoad(condition=AxialCondition.FREE_RESULTANT).model_dump(),
                "refinement_level": True,
            }
        )
    result = calculate_panda_thermal_fem(request())
    payload = result.model_dump()
    payload["displacement_x_m"] = payload["displacement_x_m"][:-1]
    with pytest.raises(ValidationError, match="displacement"):
        PandaThermalFemResult.model_validate(payload)
    aliased_pressure = request().model_dump()
    aliased_pressure["pressure_pa"] = aliased_pressure.pop("lateral_pressure_pa")
    with pytest.raises(ValidationError):
        PandaThermalFemRequest.model_validate(aliased_pressure)


def test_fine_level_uses_sparse_mixed_assembly() -> None:
    source = inspect.getsource(
        __import__(
            "fibre_sim.thermal_fem.calculations", fromlist=["_solve_augmented"]
        )._solve_augmented
    )
    assert "toarray" not in source
    assert "bmat" in source
    tracemalloc.start()
    result = calculate_panda_thermal_fem(request(refinement_level=1))
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    assert result.mesh.node_count > 1000
    assert peak < 256 * 1024 * 1024
