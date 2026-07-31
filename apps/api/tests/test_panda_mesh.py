import json
from collections.abc import AsyncIterator
from typing import Any

import httpx2
import pytest
from apps.api.app import main

from fibre_sim.panda_mesh import (
    PandaMeshRegion,
    PandaMeshRequest,
    generate_panda_mesh,
)
from fibre_sim.photoelastic import PandaGeometry

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def client() -> AsyncIterator[httpx2.AsyncClient]:
    transport = httpx2.ASGITransport(app=main.app)
    async with httpx2.AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as api_client:
        yield api_client


def geometry_payload() -> dict[str, Any]:
    return {
        "core_radius_m": 4.1e-6,
        "cladding_radius_m": 62.5e-6,
        "core_center_x_m": 0.0,
        "core_center_y_m": 0.0,
        "sap_1": {
            "radius_m": 15.0e-6,
            "center_x_m": -30.0e-6,
            "center_y_m": 0.0,
        },
        "sap_2": {
            "radius_m": 15.0e-6,
            "center_x_m": 30.0e-6,
            "center_y_m": 0.0,
        },
    }


def valid_request() -> PandaMeshRequest:
    return PandaMeshRequest(geometry=PandaGeometry.model_validate(geometry_payload()))


def request_payload(request: PandaMeshRequest | None = None) -> dict[str, Any]:
    return (request or valid_request()).model_dump(mode="json")


def nested_keys(value: object) -> set[str]:
    if isinstance(value, dict):
        return set(value).union(*(nested_keys(item) for item in value.values()))
    if isinstance(value, list):
        return set().union(*(nested_keys(item) for item in value))
    return set()


def nested_strings(value: object) -> set[str]:
    if isinstance(value, dict):
        return set().union(*(nested_strings(item) for item in value.values()))
    if isinstance(value, list):
        return set().union(*(nested_strings(item) for item in value))
    return {value} if isinstance(value, str) else set()


async def test_panda_mesh_returns_lean_mesh_only_result(client: httpx2.AsyncClient) -> None:
    request = valid_request()
    response = await client.post(
        "/api/v1/photoelastic/panda/mesh",
        json=request_payload(request),
        headers={"Accept-Encoding": "gzip"},
    )

    assert response.status_code == 200, response.text
    assert response.headers["content-encoding"] == "gzip"
    assert response.headers["vary"] == "Accept-Encoding"
    body = response.json()
    expected = generate_panda_mesh(request)

    assert body == json.loads(expected.model_dump_json())
    assert set(body) == set(expected.model_dump(mode="json"))
    assert {region.value for region in PandaMeshRegion} == {
        "core",
        "sap_1",
        "sap_2",
        "cladding",
    }
    assert {region.value for region in PandaMeshRegion} <= nested_strings(body)
    assert body["configuration"] == request.model_dump(mode="json")
    assert body["model_manifest"]["mesh_only"] is True
    assert body["model_manifest"]["solved_fem_fields"] is False
    assert body["model_manifest"]["model_version"] == "1.0.0"
    assert body["nodes_m"]
    assert body["elements"]
    assert set(body["region_tags"]) == {region.value for region in PandaMeshRegion}
    assert len(body["region_summaries"]) == 4
    assert all(summary["element_count"] >= 0 for summary in body["region_summaries"])
    assert body["node_count"] == len(body["nodes_m"])
    assert body["element_count"] == len(body["elements"]) == len(body["region_tags"])
    assert (
        sum(summary["element_count"] for summary in body["region_summaries"])
        == body["element_count"]
    )
    assert not nested_keys(body).intersection(
        {"stress", "stress_pa", "displacement", "displacement_m", "fem_solution"}
    )


async def test_repeated_panda_mesh_requests_are_deterministic(
    client: httpx2.AsyncClient,
) -> None:
    payload = request_payload()

    first = await client.post("/api/v1/photoelastic/panda/mesh", json=payload)
    second = await client.post("/api/v1/photoelastic/panda/mesh", json=payload)

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.content == second.content


async def test_tangent_geometry_returns_structured_mesh_generation_error(
    client: httpx2.AsyncClient,
) -> None:
    request = valid_request()
    tangent_geometry = request.geometry.model_copy(
        update={
            "sap_1": request.geometry.sap_1.model_copy(
                update={
                    "center_x_m": -(
                        request.geometry.core_radius_m + request.geometry.sap_1.radius_m
                    )
                }
            )
        }
    )
    tangent_request = request.model_copy(update={"geometry": tangent_geometry})

    response = await client.post(
        "/api/v1/photoelastic/panda/mesh",
        json=request_payload(tangent_request),
        headers={"X-Trace-ID": "panda-mesh-tangent-trace"},
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "CALCULATION_ERROR"
    assert error["field"] is None
    assert error["trace_id"] == "panda-mesh-tangent-trace"
    assert error["details"]["reason"] == "touching_interfaces"
    assert response.headers["X-Trace-ID"] == "panda-mesh-tangent-trace"


async def test_invalid_panda_mesh_request_preserves_validation_error(
    client: httpx2.AsyncClient,
) -> None:
    response = await client.post(
        "/api/v1/photoelastic/panda/mesh",
        json={**request_payload(), "unexpected": True},
        headers={"X-Trace-ID": "panda-mesh-validation-trace"},
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "REQUEST_VALIDATION_ERROR"
    assert error["trace_id"] == "panda-mesh-validation-trace"
    assert any(
        detail["loc"] == ["body", "unexpected"] and detail["type"] == "extra_forbidden"
        for detail in error["details"]["errors"]
    )
