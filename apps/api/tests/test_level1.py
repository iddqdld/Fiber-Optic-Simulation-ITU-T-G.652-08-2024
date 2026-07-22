import json
from collections.abc import AsyncIterator
from typing import cast

import httpx2
import pytest
from apps.api.app.main import app

from fibre_sim.bends import MAX_MACROBENDS
from fibre_sim.level1 import (
    Level1FibreConfig,
    Level1FibrePreset,
    Level1SamplingConfig,
    Level1SectionConfig,
    Level1SimulationRequest,
    Level1SourceConfig,
    calculate_level1_simulation,
)
from fibre_sim.standards import G652DAttenuationApplication

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def client() -> AsyncIterator[httpx2.AsyncClient]:
    transport = httpx2.ASGITransport(app=app)
    async with httpx2.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


def level1_payload(
    preset: Level1FibrePreset = Level1FibrePreset.CUSTOM,
) -> dict[str, object]:
    request = Level1SimulationRequest(
        preset=preset,
        fibre=Level1FibreConfig(
            n_core=1.47,
            n_cladding=1.465,
            core_radius_um=4.1,
            mode_field_radius_um=4.82,
            attenuation_db_per_km=0.2,
            dispersion_ps_per_nm_km=17.0,
            group_index_dimensionless=1.468,
            cable_application=G652DAttenuationApplication.STANDARD_CABLE,
        ),
        source=Level1SourceConfig(
            wavelength_nm=1550.0,
            input_power_dbm=-3.0,
            spectral_width_fwhm_nm=0.2,
            input_pulse_fwhm_ps=25.0,
        ),
        section=Level1SectionConfig(length_km=12.5),
        sampling=Level1SamplingConfig(grid_half_width_um=15.0, grid_points=9),
    )
    return cast(dict[str, object], request.model_dump(mode="json"))


def override_nested(payload: dict[str, object], section: str, field: str, value: object) -> None:
    nested = payload[section]
    assert isinstance(nested, dict)
    payload[section] = {**nested, field: value}


def assert_validation_error(
    response: httpx2.Response,
    location: list[str],
    error_type: str,
    trace_id: str,
) -> None:
    assert response.status_code == 422
    body = response.json()
    assert set(body) == {"error"}
    error = body["error"]
    assert set(error) == {"code", "message", "field", "details", "trace_id"}
    assert error["code"] == "REQUEST_VALIDATION_ERROR"
    assert error["message"] == "Request validation failed"
    assert error["field"] is None
    assert error["trace_id"] == trace_id
    assert response.headers["X-Trace-ID"] == trace_id
    assert any(
        detail["loc"] == location and detail["type"] == error_type
        for detail in error["details"]["errors"]
    )


def request_from_payload(payload: dict[str, object]) -> Level1SimulationRequest:
    return Level1SimulationRequest.model_validate(payload)


async def test_custom_preview_returns_exact_physics_result_without_standards_details(
    client: httpx2.AsyncClient,
) -> None:
    payload = level1_payload()
    request = request_from_payload(payload)

    response = await client.post("/api/v1/simulations/preview", json=payload)

    assert response.status_code == 200
    expected = calculate_level1_simulation(request)
    assert response.json() == json.loads(expected.model_dump_json())
    assert response.json()["standards_checks"] == {
        "preset": "custom",
        "preset_definition": None,
        "dispersion": None,
        "attenuation": None,
    }
    assert response.json()["bend_loss"]["bends"] == []
    assert (
        response.json()["bend_loss"]["input_power_dbm"]
        == response.json()["attenuation"]["output_power_dbm"]
        == response.json()["bend_loss"]["output_power_dbm"]
    )
    assert response.json()["model_manifest"]["model_version"] == "1.1.0"
    assert (
        "user_supplied_macrobend_loss" in response.json()["model_manifest"]["component_model_ids"]
    )
    assert len(response.json()["parameter_boundaries"]) == 16
    assert {boundary["field"] for boundary in response.json()["parameter_boundaries"]} == {
        "n_core",
        "n_cladding",
        "core_radius_um",
        "mode_field_radius_um",
        "attenuation_db_per_km",
        "dispersion_ps_per_nm_km",
        "group_index_dimensionless",
        "wavelength_nm",
        "input_power_dbm",
        "spectral_width_fwhm_nm",
        "input_pulse_fwhm_ps",
        "length_km",
        "grid_half_width_um",
        "grid_points",
    }


async def test_g652d_preview_returns_exact_result_with_preset_checks_and_statuses(
    client: httpx2.AsyncClient,
) -> None:
    payload = level1_payload(Level1FibrePreset.G652D)
    request = request_from_payload(payload)

    response = await client.post("/api/v1/simulations/preview", json=payload)

    assert response.status_code == 200
    expected = calculate_level1_simulation(request)
    body = response.json()
    assert body == json.loads(expected.model_dump_json())
    assert body["standards_checks"]["preset"] == "g652d"
    assert body["standards_checks"]["preset_definition"] is not None
    assert body["standards_checks"]["dispersion"]["status"] == "pass"
    assert body["standards_checks"]["attenuation"]["status"] == "pass"
    assert body["warnings"] == json.loads(expected.model_dump_json())["warnings"]
    assert len(body["parameter_boundaries"]) == 19


async def test_repeated_valid_preview_requests_are_deterministic(
    client: httpx2.AsyncClient,
) -> None:
    payload = level1_payload()

    first = await client.post("/api/v1/simulations/preview", json=payload)
    second = await client.post("/api/v1/simulations/preview", json=payload)

    assert first.status_code == second.status_code == 200
    assert first.content == second.content
    assert first.json() == second.json()


async def test_preview_serializes_multiple_bends_and_final_power(
    client: httpx2.AsyncClient,
) -> None:
    payload = level1_payload()
    section = payload["section"]
    assert isinstance(section, dict)
    payload["section"] = {
        **section,
        "bends": [
            {
                "position_fraction": 0.2,
                "radius_mm": 12.0,
                "angle_deg": 90.0,
                "supplied_loss_db": 0.4,
            },
            {
                "position_fraction": 0.7,
                "radius_mm": 12.0,
                "angle_deg": 90.0,
                "supplied_loss_db": 0.6,
            },
        ],
    }
    request = request_from_payload(payload)

    response = await client.post("/api/v1/simulations/preview", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body == json.loads(calculate_level1_simulation(request).model_dump_json())
    configured_section = payload["section"]
    assert isinstance(configured_section, dict)
    assert body["configuration"]["section"]["bends"] == configured_section["bends"]
    assert body["attenuation"]["output_power_dbm"] == -5.5
    assert body["bend_loss"]["input_power_dbm"] == -5.5
    assert body["bend_loss"]["total_bend_loss_db"] == 1.0
    assert body["bend_loss"]["output_power_dbm"] == -6.5


@pytest.mark.parametrize(
    ("case", "location", "error_type"),
    [
        (
            "refractive-index-order",
            ["body", "fibre"],
            "invalid_refractive_index_order",
        ),
        (
            "even-grid",
            ["body", "sampling"],
            "grid_points_must_be_odd",
        ),
        (
            "g652d-wavelength-domain",
            ["body"],
            "g652d_wavelength_outside_preset_domain",
        ),
        ("extra-nested-field", ["body", "fibre", "unexpected"], "extra_forbidden"),
        ("non-finite-nested-value", ["body", "fibre", "n_core"], "finite_number"),
    ],
    ids=[
        "refractive-index-order",
        "even-grid",
        "g652d-wavelength-domain",
        "extra-nested-field",
        "non-finite-nested-value",
    ],
)
async def test_invalid_preview_requests_return_stable_errors_and_trace_echo(
    client: httpx2.AsyncClient,
    case: str,
    location: list[str],
    error_type: str,
) -> None:
    payload = level1_payload()
    if case == "refractive-index-order":
        override_nested(payload, "fibre", "n_core", 1.465)
    elif case == "even-grid":
        override_nested(payload, "sampling", "grid_points", 64)
    elif case == "g652d-wavelength-domain":
        payload["preset"] = "g652d"
        override_nested(payload, "source", "wavelength_nm", 1259.0)
    elif case == "extra-nested-field":
        override_nested(payload, "fibre", "unexpected", "value")
    else:
        override_nested(payload, "fibre", "n_core", float("nan"))

    trace_id = f"level1-{case}-trace"
    headers = {"X-Trace-ID": trace_id}
    if case == "non-finite-nested-value":
        response = await client.post(
            "/api/v1/simulations/preview",
            content=json.dumps(payload),
            headers={**headers, "Content-Type": "application/json"},
        )
    else:
        response = await client.post(
            "/api/v1/simulations/preview",
            json=payload,
            headers=headers,
        )

    assert_validation_error(response, location, error_type, trace_id)


@pytest.mark.parametrize(
    ("bends", "location", "error_type"),
    [
        (
            [
                {
                    "position_fraction": 0.5,
                    "radius_mm": 12.0,
                    "angle_deg": 90.0,
                    "supplied_loss_db": 0.4,
                },
                {
                    "position_fraction": 0.5,
                    "radius_mm": 12.0,
                    "angle_deg": 90.0,
                    "supplied_loss_db": 0.4,
                },
            ],
            ["body", "section"],
            "bend_positions_not_strictly_increasing",
        ),
        (
            [
                {
                    "position_fraction": index / (MAX_MACROBENDS + 1),
                    "radius_mm": 12.0,
                    "angle_deg": 90.0,
                    "supplied_loss_db": 0.1,
                }
                for index in range(1, MAX_MACROBENDS + 2)
            ],
            ["body", "section", "bends"],
            "too_long",
        ),
    ],
    ids=["non-increasing-positions", "maximum-bend-count"],
)
async def test_invalid_bend_sections_return_typed_422_errors(
    client: httpx2.AsyncClient,
    bends: list[dict[str, object]],
    location: list[str],
    error_type: str,
) -> None:
    payload = level1_payload()
    section = payload["section"]
    assert isinstance(section, dict)
    payload["section"] = {**section, "bends": bends}

    response = await client.post(
        "/api/v1/simulations/preview",
        json=payload,
        headers={"X-Trace-ID": "level1-bend-validation"},
    )

    assert_validation_error(response, location, error_type, "level1-bend-validation")
