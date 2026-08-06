import json
from collections.abc import AsyncIterator
from typing import Any

import httpx2
import pytest
from apps.api.app import main

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
    PandaThermalFemCalculationError,
    PandaThermalFemRequest,
    calculate_panda_thermal_fem,
)

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def client() -> AsyncIterator[httpx2.AsyncClient]:
    transport = httpx2.ASGITransport(app=main.app)
    async with httpx2.AsyncClient(transport=transport, base_url="http://testserver") as api_client:
        yield api_client


def geometry() -> PandaGeometry:
    return PandaGeometry(
        core_radius_m=4.1e-6,
        cladding_radius_m=62.5e-6,
        core_center_x_m=0.0,
        core_center_y_m=0.0,
        sap_1=CircularSAP(radius_m=17.0e-6, center_x_m=-32.0e-6, center_y_m=0.0),
        sap_2=CircularSAP(radius_m=17.0e-6, center_x_m=32.0e-6, center_y_m=0.0),
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
            citation="Step 2.6 API test data",
            confidence=MaterialConfidence.DEMONSTRATION_ONLY,
        ),
    )


def materials() -> PandaMaterialSet:
    return PandaMaterialSet(
        core=material("core", 72.0e9, 0.17, 5.0e-7),
        cladding=material("cladding", 70.0e9, 0.20, 5.5e-7),
        sap_1=material("sap_1", 80.0e9, 0.23, 8.0e-6),
        sap_2=material("sap_2", 90.0e9, 0.10, 7.0e-6),
    )


def request(
    condition: AxialCondition = AxialCondition.FREE_RESULTANT,
    prescribed_force_n: float | None = None,
    prescribed_strain: float | None = None,
) -> PandaThermalFemRequest:
    return PandaThermalFemRequest(
        geometry=geometry(),
        materials=materials(),
        thermal=ThermalState(temperature_k=293.0, effective_fictive_temperature_k=1000.0),
        axial_load=AxialLoad(
            condition=condition,
            prescribed_force_n=prescribed_force_n,
            prescribed_strain=prescribed_strain,
        ),
        refinement_level=0,
    )


def payload(model: PandaThermalFemRequest | None = None) -> dict[str, Any]:
    return (model or request()).model_dump(mode="json")


async def test_thermal_fem_returns_deterministic_typed_result_and_gzip(
    client: httpx2.AsyncClient,
) -> None:
    model_request = request()
    expected = calculate_panda_thermal_fem(model_request)
    first = await client.post(
        "/api/v1/photoelastic/panda/thermal-fem",
        json=payload(model_request),
        headers={"Accept-Encoding": "gzip"},
    )
    second = await client.post(
        "/api/v1/photoelastic/panda/thermal-fem",
        json=payload(model_request),
        headers={"Accept-Encoding": "gzip"},
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.headers["content-encoding"] == "gzip"
    assert first.headers["vary"] == "Accept-Encoding"
    assert first.content == second.content
    assert first.json() == json.loads(expected.model_dump_json())


async def test_thermal_fem_response_contains_configuration_units_and_solved_fields(
    client: httpx2.AsyncClient,
) -> None:
    response = await client.post("/api/v1/photoelastic/panda/thermal-fem", json=payload())

    assert response.status_code == 200, response.text
    body = response.json()
    manifest = body["model_manifest"]
    mesh = body["mesh"]

    assert set(body) == {
        "configuration",
        "mesh",
        "displacement_x_m",
        "displacement_y_m",
        "element_strain_xx",
        "element_strain_yy",
        "element_strain_zz",
        "element_strain_xy",
        "element_stress_xx_pa",
        "element_stress_yy_pa",
        "element_stress_zz_pa",
        "element_stress_xy_pa",
        "element_pressure_increment_stress_xx_pa",
        "element_pressure_increment_stress_yy_pa",
        "element_pressure_increment_stress_zz_pa",
        "element_pressure_increment_stress_xy_pa",
        "element_principal_max_pa",
        "element_principal_min_pa",
        "element_principal_difference_pa",
        "element_principal_axis_angle_rad",
        "element_stress_optic_coefficient_per_pa",
        "element_signed_local_material_birefringence",
        "element_local_material_birefringence",
        "element_local_material_slow_axis_angle_rad",
        "epsilon_zz_0",
        "core_summary",
        "baseline_core_summary",
        "pressure_increment_core_summary",
        "anchor_reactions",
        "force_balance",
        "convergence",
        "qualitative_kernel_fem_shape_comparison",
        "optical_birefringence",
        "torsion",
        "warnings",
        "model_manifest",
    }
    assert body["configuration"] == payload()
    assert manifest["method"] == "fem_generalized_plane_strain"
    assert manifest["stress_measure"] == "cauchy_stress"
    assert manifest["stress_units"] == "Pa"
    assert manifest["displacement_units"] == "m"
    assert manifest["strain_units"] == "1"
    assert manifest["axial_strain_model"] == "uniform_epsilon_zz_0"
    assert manifest["equation"] == "transverse_weak_equilibrium_plus_axial_resultant"
    assert manifest["axial_equation"] == "integral_sigma_zz_d_a_equals_n_z"
    assert manifest["model_version"] == "1.2.0"
    assert manifest["exterior_boundary_model"] == (
        "traction_free_at_zero_pressure_or_prescribed_bare_glass_lateral_pressure"
    )
    assert manifest["birefringence_computed"] is True
    assert manifest["birefringence_scope"] == "local_material_and_first_order_scalar_lp01_phase"
    assert manifest["birefringence_units"] == "1"
    assert manifest["stress_optic_coefficient_units"] == "Pa^-1"
    assert manifest["local_not_modal"] is True
    assert manifest["equation_references"] == [
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
    ]
    comparison = body["qualitative_kernel_fem_shape_comparison"]
    assert comparison["model_id"] == "qualitative_kernel_fem_shape_comparison"
    assert comparison["quantitative"] is False
    assert comparison["units"] == "1"
    assert comparison["domain"] == "core_elements"
    assert "modal phase" in " ".join(manifest["limitations"])
    assert len(body["displacement_x_m"]) == mesh["node_count"]
    assert len(body["displacement_y_m"]) == mesh["node_count"]
    for field in (
        "element_stress_xx_pa",
        "element_stress_yy_pa",
        "element_stress_zz_pa",
        "element_stress_xy_pa",
        "element_principal_difference_pa",
        "element_stress_optic_coefficient_per_pa",
        "element_signed_local_material_birefringence",
        "element_local_material_birefringence",
    ):
        assert len(body[field]) == mesh["element_count"]
    assert body["convergence"][0]["status"] == "unavailable"
    assert body["force_balance"]["axial_target_n"] == 0.0
    assert body["optical_birefringence"]["pressure_induced"]["phase_birefringence_magnitude"] == 0.0
    assert body["optical_birefringence"]["group_birefringence"]["available"] is False
    assert body["torsion"]["analytical_mechanics_benchmark_only"] is True


async def test_thermal_fem_api_returns_the_positive_pressure_increment(
    client: httpx2.AsyncClient,
) -> None:
    model_request = request().model_copy(update={"lateral_pressure_pa": 1.0e6})
    response = await client.post(
        "/api/v1/photoelastic/panda/thermal-fem",
        json=payload(model_request),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["configuration"]["lateral_pressure_pa"] == 1.0e6
    assert body["model_manifest"]["pressure_sign_convention"] == "sigma_n_equals_minus_p_n"
    assert body["pressure_increment_core_summary"]["average_stress_xx_pa"] < 0.0
    assert body["pressure_increment_core_summary"]["average_stress_yy_pa"] < 0.0
    assert (
        body["optical_birefringence"]["pressure_induced"]
        != body["optical_birefringence"]["zero_pressure_residual"]
    )


@pytest.mark.parametrize(
    (
        "condition",
        "prescribed_force_n",
        "prescribed_strain",
        "expected_target",
        "expected_strain",
    ),
    [
        ("free_resultant", None, None, 0.0, None),
        ("prescribed_force", 0.1, None, 0.1, None),
        ("prescribed_strain", None, 2.0e-4, None, 2.0e-4),
    ],
)
async def test_thermal_fem_supports_all_axial_request_modes(
    client: httpx2.AsyncClient,
    condition: str,
    prescribed_force_n: float | None,
    prescribed_strain: float | None,
    expected_target: float | None,
    expected_strain: float | None,
) -> None:
    model_request = request(
        AxialCondition(condition),
        prescribed_force_n=prescribed_force_n,
        prescribed_strain=prescribed_strain,
    )
    response = await client.post(
        "/api/v1/photoelastic/panda/thermal-fem",
        json=payload(model_request),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["configuration"]["axial_load"]["condition"] == condition
    assert body["force_balance"]["axial_target_n"] == expected_target
    if expected_strain is not None:
        assert body["epsilon_zz_0"] == pytest.approx(expected_strain)


async def test_thermal_fem_maps_calculation_failure_with_trace_id(
    client: httpx2.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail(_: PandaThermalFemRequest) -> Any:
        raise PandaThermalFemCalculationError("forced_failure", "forced failure")

    monkeypatch.setattr(main, "calculate_panda_thermal_fem", fail)
    response = await client.post(
        "/api/v1/photoelastic/panda/thermal-fem",
        json=payload(),
        headers={"X-Trace-ID": "thermal-fem-calculation-trace"},
    )

    assert response.status_code == 422
    assert response.json()["error"] == {
        "code": "CALCULATION_ERROR",
        "message": "PANDA thermal FEM could not be calculated from the supplied values.",
        "field": None,
        "details": {"reason": "forced_failure"},
        "trace_id": "thermal-fem-calculation-trace",
    }
    assert response.headers["X-Trace-ID"] == "thermal-fem-calculation-trace"


@pytest.mark.parametrize(
    ("condition", "prescribed_force_n", "prescribed_strain"),
    [
        ("free_resultant", 0.1, None),
        ("prescribed_force", None, None),
        ("prescribed_strain", 0.1, 2.0e-4),
    ],
)
async def test_thermal_fem_maps_invalid_axial_combinations_with_trace_id(
    client: httpx2.AsyncClient,
    condition: str,
    prescribed_force_n: float | None,
    prescribed_strain: float | None,
) -> None:
    invalid = payload()
    invalid["axial_load"]["condition"] = condition
    invalid["axial_load"]["prescribed_force_n"] = prescribed_force_n
    invalid["axial_load"]["prescribed_strain"] = prescribed_strain
    response = await client.post(
        "/api/v1/photoelastic/panda/thermal-fem",
        json=invalid,
        headers={"X-Trace-ID": "thermal-fem-validation-trace"},
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "REQUEST_VALIDATION_ERROR"
    assert error["trace_id"] == "thermal-fem-validation-trace"
    assert any(
        detail["type"] == "axial_condition_fields_inconsistent"
        for detail in error["details"]["errors"]
    )
