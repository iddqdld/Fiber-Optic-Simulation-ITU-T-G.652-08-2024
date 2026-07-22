import json
import math
from collections.abc import AsyncIterator
from typing import NoReturn, cast

import httpx2
import pytest
from apps.api.app import main
from apps.api.app.main import app

from fibre_sim.level1 import (
    Level1FibreConfig,
    Level1FibrePreset,
    Level1SamplingConfig,
    Level1SectionConfig,
    Level1SimulationRequest,
    Level1SourceConfig,
)
from fibre_sim.standards import G652DAttenuationApplication
from fibre_sim.sweeps import (
    Level1SweepCalculationError,
    Level1SweepPoint,
    Level1SweepRequest,
    calculate_level1_sweep,
)

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def client() -> AsyncIterator[httpx2.AsyncClient]:
    transport = httpx2.ASGITransport(app=app)
    async with httpx2.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


def base_configuration(
    preset: Level1FibrePreset = Level1FibrePreset.CUSTOM,
) -> Level1SimulationRequest:
    return Level1SimulationRequest(
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


def sweep_payload(
    *,
    preset: Level1FibrePreset = Level1FibrePreset.CUSTOM,
    parameter: str = "length_km",
    start_value: float = 1.0,
    stop_value: float = 5.0,
    sample_count: int = 3,
) -> dict[str, object]:
    request = Level1SweepRequest.model_validate(
        {
            "base_configuration": base_configuration(preset).model_dump(mode="json"),
            "parameter": parameter,
            "start_value": start_value,
            "stop_value": stop_value,
            "sample_count": sample_count,
        }
    )
    return cast(dict[str, object], request.model_dump(mode="json"))


def assert_request_error(response: httpx2.Response, trace_id: str) -> None:
    assert response.status_code == 422
    body = response.json()
    assert set(body) == {"error"}
    error = body["error"]
    assert set(error) == {"code", "message", "field", "details", "trace_id"}
    assert error["code"] == "REQUEST_VALIDATION_ERROR"
    assert error["message"] == "Request validation failed"
    assert error["trace_id"] == trace_id
    assert response.headers["X-Trace-ID"] == trace_id
    assert error["details"]["errors"]


async def test_custom_sweep_matches_physics_result_and_has_compact_points(
    client: httpx2.AsyncClient,
) -> None:
    payload = sweep_payload()
    request = Level1SweepRequest.model_validate(payload)

    response = await client.post("/api/v1/simulations/sweep", json=payload)

    assert response.status_code == 200
    expected = calculate_level1_sweep(request)
    assert response.json() == json.loads(expected.model_dump_json())
    assert response.json()["request"] == payload
    assert response.json()["points"]
    point_fields = set(Level1SweepPoint.model_fields)
    for point in response.json()["points"]:
        assert set(point) == point_fields
        assert "mode_profile" not in point
        assert "configuration" not in point
        assert "guidance" not in point


async def test_repeated_sweep_requests_are_deterministic(client: httpx2.AsyncClient) -> None:
    payload = sweep_payload()

    first = await client.post("/api/v1/simulations/sweep", json=payload)
    second = await client.post("/api/v1/simulations/sweep", json=payload)

    assert first.status_code == second.status_code == 200
    assert first.content == second.content


async def test_two_hundred_point_cap_returns_exact_compact_result(
    client: httpx2.AsyncClient,
) -> None:
    payload = sweep_payload(sample_count=200)
    request = Level1SweepRequest.model_validate(payload)

    response = await client.post("/api/v1/simulations/sweep", json=payload)

    assert response.status_code == 200
    assert response.json() == json.loads(calculate_level1_sweep(request).model_dump_json())
    assert len(response.json()["points"]) == 200
    assert response.json()["points"][0]["parameter_value"] == 1.0
    assert response.json()["points"][-1]["parameter_value"] == 5.0


async def test_g652d_sweep_exposes_standard_statuses(client: httpx2.AsyncClient) -> None:
    custom = await client.post("/api/v1/simulations/sweep", json=sweep_payload())
    g652d = await client.post(
        "/api/v1/simulations/sweep",
        json=sweep_payload(preset=Level1FibrePreset.G652D),
    )

    assert custom.status_code == g652d.status_code == 200
    custom_statuses = [
        value
        for point in custom.json()["points"]
        for key, value in point.items()
        if "status" in key
    ]
    g652d_statuses = [
        value for point in g652d.json()["points"] for key, value in point.items() if "status" in key
    ]
    assert custom_statuses
    assert all(value is None for value in custom_statuses)
    assert g652d_statuses
    assert all(value in {"pass", "not_applicable"} for value in g652d_statuses)


@pytest.mark.parametrize(
    "overrides",
    [
        {"start_value": -1.0},
        {"stop_value": float("inf")},
        {"start_value": 2.0, "stop_value": 2.0},
        {"start_value": 5.0, "stop_value": 1.0},
        {"sample_count": 201},
        {"parameter": "n_core", "start_value": 1.464},
    ],
    ids=["range", "non-finite", "equal", "descending", "sample-count", "invalid-endpoint"],
)
async def test_invalid_sweep_requests_echo_trace_id(
    client: httpx2.AsyncClient,
    overrides: dict[str, object],
) -> None:
    payload = sweep_payload()
    payload.update(overrides)
    trace_id = "sweep-validation-trace"

    if any(isinstance(value, float) and not math.isfinite(value) for value in payload.values()):
        response = await client.post(
            "/api/v1/simulations/sweep",
            content=json.dumps(payload),
            headers={"X-Trace-ID": trace_id, "Content-Type": "application/json"},
        )
    else:
        response = await client.post(
            "/api/v1/simulations/sweep",
            json=payload,
            headers={"X-Trace-ID": trace_id},
        )

    assert_request_error(response, trace_id)


async def test_g652d_invalid_sweep_endpoint_returns_request_error(
    client: httpx2.AsyncClient,
) -> None:
    payload = {
        "base_configuration": base_configuration(Level1FibrePreset.G652D).model_dump(mode="json"),
        "parameter": "wavelength_nm",
        "start_value": 1259.0,
        "stop_value": 1261.0,
        "sample_count": 3,
    }
    trace_id = "sweep-endpoint-trace"

    response = await client.post(
        "/api/v1/simulations/sweep",
        json=payload,
        headers={"X-Trace-ID": trace_id},
    )

    assert_request_error(response, trace_id)


async def test_extra_sweep_field_returns_request_error_and_echoes_trace_id(
    client: httpx2.AsyncClient,
) -> None:
    payload = {**sweep_payload(), "unexpected": "value"}
    trace_id = "sweep-extra-field-trace"

    response = await client.post(
        "/api/v1/simulations/sweep",
        json=payload,
        headers={"X-Trace-ID": trace_id},
    )

    assert_request_error(response, trace_id)


async def test_sweep_calculation_error_is_translated_without_exception_text(
    client: httpx2.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = Level1SweepRequest.model_validate(sweep_payload())

    def fail(_: Level1SweepRequest) -> NoReturn:
        raise Level1SweepCalculationError(
            parameter=request.parameter,
            sample_index=0,
            parameter_value=request.start_value,
        )

    monkeypatch.setattr(main, "calculate_level1_sweep", fail)
    trace_id = "sweep-calculation-trace"

    response = await client.post(
        "/api/v1/simulations/sweep",
        json=sweep_payload(),
        headers={"X-Trace-ID": trace_id},
    )

    assert response.status_code == 422
    body = response.json()
    error = body["error"]
    assert error["code"] == "CALCULATION_ERROR"
    assert error["message"] == (
        "Level 1 parameter sweep could not produce finite results from the supplied values."
    )
    assert "Level 1 sweep calculation failed" not in response.text
    assert error["details"] == {"reason": "non_finite_result"}
    assert error["trace_id"] == trace_id
    assert response.headers["X-Trace-ID"] == trace_id
