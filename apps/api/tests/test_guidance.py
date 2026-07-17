import json
import math
from collections.abc import AsyncIterator

import httpx2
import pytest
from apps.api.app.main import app

from fibre_sim.guidance import GuidanceRequest, calculate_guidance

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def client() -> AsyncIterator[httpx2.AsyncClient]:
    transport = httpx2.ASGITransport(app=app)
    async with httpx2.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


def valid_payload() -> dict[str, float]:
    return {
        "n_core": 1.45,
        "n_cladding": 1.444,
        "core_radius_um": 4.1,
        "wavelength_nm": 1550.0,
    }


def assert_validation_error(
    response: httpx2.Response,
    location: list[str],
    error_type: str,
    trace_id: str | None = None,
) -> None:
    assert response.status_code == 422
    body = response.json()
    assert set(body) == {"error"}
    error = body["error"]
    assert set(error) == {"code", "message", "field", "details", "trace_id"}
    assert error["code"] == "REQUEST_VALIDATION_ERROR"
    assert error["message"] == "Request validation failed"
    assert error["field"] is None
    if trace_id is not None:
        assert error["trace_id"] == trace_id
        assert response.headers["X-Trace-ID"] == trace_id
    assert any(
        detail["loc"] == location and detail["type"] == error_type
        for detail in error["details"]["errors"]
    )


async def test_educational_low_v_request_returns_the_typed_calculation(
    client: httpx2.AsyncClient,
) -> None:
    request = GuidanceRequest(**valid_payload())

    response = await client.post("/api/v1/guidance/calculate", json=request.model_dump(mode="json"))

    assert response.status_code == 200
    expected = calculate_guidance(request).model_dump(mode="json")
    assert response.json() == expected
    assert response.json()["approximate_mode_count"] is None
    assert response.json()["warnings"] == [
        {
            "code": "mode_count_unavailable",
            "message": (
                "V^2/2 estimate requires V >= 10.0 under the project validity policy "
                "(clearly highly multimode regime)."
            ),
            "output_field": "approximate_mode_count",
        }
    ]


async def test_high_v_na_at_one_returns_unrounded_mode_count_without_warnings(
    client: httpx2.AsyncClient,
) -> None:
    request = GuidanceRequest(
        n_core=1.25,
        n_cladding=0.75,
        core_radius_um=1.75,
        wavelength_nm=1000.0,
    )

    response = await client.post("/api/v1/guidance/calculate", json=request.model_dump(mode="json"))

    assert response.status_code == 200
    body = response.json()
    expected = calculate_guidance(request).model_dump(mode="json")
    assert body == expected
    assert body["numerical_aperture_dimensionless"] == 1.0
    assert body["air_acceptance_angle_deg"] == 90.0
    assert body["approximate_mode_count"] == pytest.approx(60.45132695667232)
    assert not body["approximate_mode_count"].is_integer()
    assert body["warnings"] == []


async def test_na_above_one_nulls_only_air_angle_and_exposes_its_warning(
    client: httpx2.AsyncClient,
) -> None:
    request = GuidanceRequest(
        n_core=2.0,
        n_cladding=1.0,
        core_radius_um=4.1,
        wavelength_nm=1550.0,
    )

    response = await client.post("/api/v1/guidance/calculate", json=request.model_dump(mode="json"))

    assert response.status_code == 200
    body = response.json()
    expected = calculate_guidance(request).model_dump(mode="json")
    assert body == expected
    assert body["air_acceptance_angle_deg"] is None
    assert body["approximate_mode_count"] is not None
    assert body["warnings"] == [
        {
            "code": "air_acceptance_angle_unavailable",
            "message": (
                "Inverse-sine air acceptance-angle model requires numerical aperture <= 1."
            ),
            "output_field": "air_acceptance_angle_deg",
        }
    ]


@pytest.mark.parametrize(
    ("n_core", "n_cladding"),
    [(1.45, 1.45), (1.44, 1.45)],
    ids=["equal-indices", "reversed-indices"],
)
async def test_equal_or_reversed_indices_return_validation_error(
    client: httpx2.AsyncClient, n_core: float, n_cladding: float
) -> None:
    payload = valid_payload()
    payload.update(n_core=n_core, n_cladding=n_cladding)

    response = await client.post("/api/v1/guidance/calculate", json=payload)

    assert_validation_error(response, ["body"], "invalid_refractive_index_order")


@pytest.mark.parametrize("field", ["n_core", "n_cladding", "core_radius_um", "wavelength_nm"])
async def test_missing_field_returns_validation_error(
    client: httpx2.AsyncClient, field: str
) -> None:
    payload = valid_payload()
    del payload[field]

    response = await client.post("/api/v1/guidance/calculate", json=payload)

    assert_validation_error(response, ["body", field], "missing")


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("core_radius_um", 0.0),
        ("core_radius_um", -1.0),
        ("wavelength_nm", 0.0),
        ("wavelength_nm", -1.0),
    ],
    ids=["zero-radius", "negative-radius", "zero-wavelength", "negative-wavelength"],
)
async def test_non_positive_dimension_returns_validation_error(
    client: httpx2.AsyncClient, field: str, value: float
) -> None:
    payload = valid_payload()
    payload[field] = value

    response = await client.post("/api/v1/guidance/calculate", json=payload)

    assert_validation_error(response, ["body", field], "greater_than")


@pytest.mark.parametrize(
    ("field", "value"),
    [
        (field, value)
        for field in ("n_core", "n_cladding", "core_radius_um", "wavelength_nm")
        for value in (math.nan, math.inf, -math.inf)
    ],
    ids=[
        f"{field}-{value_name}"
        for field in ("n_core", "n_cladding", "core_radius_um", "wavelength_nm")
        for value_name in ("nan", "positive-inf", "negative-inf")
    ],
)
async def test_non_finite_json_value_returns_validation_error(
    client: httpx2.AsyncClient, field: str, value: float
) -> None:
    payload = valid_payload()
    payload[field] = value

    response = await client.post(
        "/api/v1/guidance/calculate",
        content=json.dumps(payload),
        headers={"Content-Type": "application/json"},
    )

    assert_validation_error(response, ["body", field], "finite_number")


async def test_extra_field_returns_validation_error_and_echoes_trace_id(
    client: httpx2.AsyncClient,
) -> None:
    payload = {**valid_payload(), "unexpected": "value"}

    response = await client.post(
        "/api/v1/guidance/calculate",
        json=payload,
        headers={"X-Trace-ID": "guidance-validation-trace"},
    )

    assert_validation_error(
        response,
        ["body", "unexpected"],
        "extra_forbidden",
        trace_id="guidance-validation-trace",
    )


async def test_repeated_valid_requests_are_deterministic(
    client: httpx2.AsyncClient,
) -> None:
    payload = valid_payload()

    first = await client.post("/api/v1/guidance/calculate", json=payload)
    second = await client.post("/api/v1/guidance/calculate", json=payload)

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
