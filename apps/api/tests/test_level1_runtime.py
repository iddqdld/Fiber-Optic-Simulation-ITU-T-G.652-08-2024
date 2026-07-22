import asyncio
import statistics
import time
from collections.abc import AsyncIterator
from typing import NoReturn, cast

import httpx2
import pytest
from apps.api.app import main
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
from fibre_sim.modes import MAX_GRID_POINTS, MIN_GRID_POINTS
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
    *,
    attenuation_db_per_km: float = 0.2,
    core_radius_um: float = 4.1,
    dispersion_ps_per_nm_km: float = 17.0,
    grid_points: int = 9,
    group_index_dimensionless: float = 1.468,
    input_power_dbm: float = -3.0,
    length_km: float = 12.5,
    wavelength_nm: float = 1550.0,
) -> dict[str, object]:
    request = Level1SimulationRequest(
        preset=preset,
        fibre=Level1FibreConfig(
            n_core=1.47,
            n_cladding=1.465,
            core_radius_um=core_radius_um,
            mode_field_radius_um=4.82,
            attenuation_db_per_km=attenuation_db_per_km,
            dispersion_ps_per_nm_km=dispersion_ps_per_nm_km,
            group_index_dimensionless=group_index_dimensionless,
            cable_application=G652DAttenuationApplication.STANDARD_CABLE,
        ),
        source=Level1SourceConfig(
            wavelength_nm=wavelength_nm,
            input_power_dbm=input_power_dbm,
            spectral_width_fwhm_nm=0.2,
            input_pulse_fwhm_ps=25.0,
        ),
        section=Level1SectionConfig(length_km=length_km),
        sampling=Level1SamplingConfig(
            grid_half_width_um=15.0,
            grid_points=grid_points,
        ),
    )
    return cast(dict[str, object], request.model_dump(mode="json"))


def override_nested(payload: dict[str, object], section: str, field: str, value: object) -> None:
    nested = payload[section]
    assert isinstance(nested, dict)
    payload[section] = {**nested, field: value}


@pytest.mark.parametrize("preset", [Level1FibrePreset.CUSTOM, Level1FibrePreset.G652D])
async def test_repeated_maximum_grid_preview_responses_are_byte_deterministic(
    client: httpx2.AsyncClient,
    preset: Level1FibrePreset,
) -> None:
    payload = level1_payload(preset, grid_points=MAX_GRID_POINTS)

    responses = [await client.post("/api/v1/simulations/preview", json=payload) for _ in range(3)]

    assert all(response.status_code == 200 for response in responses)
    assert all(response.content == responses[0].content for response in responses[1:])


async def test_concurrent_custom_and_g652d_preview_requests_do_not_cross_talk(
    client: httpx2.AsyncClient,
) -> None:
    payloads = (
        level1_payload(
            Level1FibrePreset.CUSTOM,
            input_power_dbm=-3.0,
            length_km=12.5,
            wavelength_nm=1310.0,
        ),
        level1_payload(
            Level1FibrePreset.G652D,
            input_power_dbm=-11.0,
            length_km=40.0,
            wavelength_nm=1625.0,
        ),
        level1_payload(
            Level1FibrePreset.CUSTOM,
            input_power_dbm=-20.0,
            length_km=0.5,
            wavelength_nm=850.0,
        ),
        level1_payload(
            Level1FibrePreset.G652D,
            input_power_dbm=2.0,
            length_km=1.0,
            wavelength_nm=1260.0,
        ),
    )
    expected = [Level1SimulationRequest.model_validate(payload) for payload in payloads]
    expected_results = [
        calculate_level1_simulation(request).model_dump(mode="json") for request in expected
    ]

    responses = await asyncio.gather(
        *(client.post("/api/v1/simulations/preview", json=payload) for payload in payloads)
    )

    for response, expected_result in zip(responses, expected_results, strict=True):
        assert response.status_code == 200
        assert response.json() == expected_result


@pytest.mark.parametrize("preset", [Level1FibrePreset.CUSTOM, Level1FibrePreset.G652D])
async def test_normal_maximum_grid_preview_returns_complete_result(
    client: httpx2.AsyncClient,
    preset: Level1FibrePreset,
) -> None:
    payload = level1_payload(preset, grid_points=MAX_GRID_POINTS)

    response = await client.post("/api/v1/simulations/preview", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["configuration"] == payload
    assert body["mode_profile"]["grid_points"] == MAX_GRID_POINTS
    assert len(body["mode_profile"]["x_um"]) == MAX_GRID_POINTS
    assert len(body["mode_profile"]["normalized_field"]) == MAX_GRID_POINTS
    assert body["standards_checks"]["preset"] == preset.value


@pytest.mark.parametrize("preset", [Level1FibrePreset.CUSTOM, Level1FibrePreset.G652D])
async def test_normal_maximum_grid_preview_p95_stays_below_plan_budget(
    client: httpx2.AsyncClient,
    preset: Level1FibrePreset,
) -> None:
    payload = level1_payload(preset, grid_points=MAX_GRID_POINTS)
    warmup = await client.post("/api/v1/simulations/preview", json=payload)
    assert warmup.status_code == 200
    payload_bytes = len(warmup.content)

    durations_ms: list[float] = []
    for _ in range(5):
        started = time.perf_counter()
        response = await client.post("/api/v1/simulations/preview", json=payload)
        durations_ms.append((time.perf_counter() - started) * 1000.0)
        assert response.status_code == 200

    ordered = sorted(durations_ms)
    p95_ms = statistics.quantiles(ordered, n=20, method="inclusive")[18]
    print(
        f"level1_preview preset={preset.value} samples_ms="
        f"{[round(duration, 2) for duration in durations_ms]} "
        f"payload_bytes={payload_bytes} "
        f"min_ms={min(durations_ms):.2f} median_ms={statistics.median(durations_ms):.2f} "
        f"p95_ms={p95_ms:.2f} max_ms={max(durations_ms):.2f}"
    )
    assert p95_ms < 300.0


@pytest.mark.parametrize(
    "case",
    [
        "attenuation-overflow",
        "group-delay-overflow",
        "pulse-broadening-overflow",
        "v-number-overflow",
        "macrobend-overflow",
    ],
)
async def test_extreme_finite_previews_return_structured_calculation_errors(
    case: str,
) -> None:
    payload = level1_payload(grid_points=MIN_GRID_POINTS)
    if case == "attenuation-overflow":
        payload["section"] = {"length_km": 1e308}
        override_nested(payload, "fibre", "attenuation_db_per_km", 1e308)
    elif case == "group-delay-overflow":
        payload["section"] = {"length_km": 1e308}
        override_nested(payload, "fibre", "group_index_dimensionless", 1e308)
    elif case == "pulse-broadening-overflow":
        payload["section"] = {"length_km": 1e308}
        override_nested(payload, "fibre", "dispersion_ps_per_nm_km", 1e308)
        override_nested(payload, "fibre", "group_index_dimensionless", 5e-324)
    elif case == "v-number-overflow":
        override_nested(payload, "fibre", "core_radius_um", 1e308)
        override_nested(payload, "source", "wavelength_nm", 1e-308)
    else:
        payload["section"] = {
            "length_km": 12.5,
            "bends": [
                {
                    "position_fraction": index / (MAX_MACROBENDS + 1),
                    "radius_mm": 12.0,
                    "angle_deg": 90.0,
                    "supplied_loss_db": 1e308,
                }
                for index in range(1, MAX_MACROBENDS + 1)
            ],
        }
    Level1SimulationRequest.model_validate(payload)
    trace_id = f"level1-{case}-trace"
    transport = httpx2.ASGITransport(app=app, raise_app_exceptions=False)

    async with httpx2.AsyncClient(
        transport=transport,
        base_url="http://testserver",
        timeout=1.0,
    ) as client:
        response = await asyncio.wait_for(
            client.post(
                "/api/v1/simulations/preview",
                json=payload,
                headers={"X-Trace-ID": trace_id},
            ),
            timeout=1.0,
        )

    assert response.status_code == 422, response.text
    body = response.json()
    assert set(body) == {"error"}
    error = body["error"]
    assert set(error) == {"code", "message", "field", "details", "trace_id"}
    assert error["code"] == "CALCULATION_ERROR"
    assert error["message"] == (
        "Level 1 simulation could not produce finite results from the supplied values."
    )
    assert error["field"] is None
    assert error["details"] == {"reason": "non_finite_result"}
    assert error["trace_id"] == trace_id
    assert response.headers["X-Trace-ID"] == trace_id


async def test_unrelated_runtime_error_from_preview_is_not_translated(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = level1_payload(grid_points=MIN_GRID_POINTS)

    def raise_runtime_error(_: Level1SimulationRequest) -> NoReturn:
        raise RuntimeError("unrelated preview failure")

    monkeypatch.setattr(main, "calculate_level1_simulation", raise_runtime_error)
    transport = httpx2.ASGITransport(app=app, raise_app_exceptions=True)

    async with httpx2.AsyncClient(transport=transport, base_url="http://testserver") as client:
        with pytest.raises(RuntimeError, match="unrelated preview failure"):
            await client.post("/api/v1/simulations/preview", json=payload)
