import inspect
import math
import tracemalloc

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
)
from fibre_sim.thermal_fem import (
    PandaThermalFemRequest,
    PandaThermalFemResult,
    calculate_panda_thermal_fem,
)
from fibre_sim.thermal_fem.calculations import _solve_level, _thermal_strain


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
    assert result.model_manifest.birefringence_computed is False


def test_convergence_has_counts_and_level_zero_status() -> None:
    result = calculate_panda_thermal_fem(request(refinement_level=1))

    assert len(result.convergence) == 2
    assert result.convergence[0].status == "unavailable"
    assert result.convergence[0].relative_change is None
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
