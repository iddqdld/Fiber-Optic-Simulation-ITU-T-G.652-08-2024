import json
from collections.abc import AsyncIterator
from typing import Any, NoReturn

import httpx2
import pytest
from apps.api.app import main
from pydantic import ValidationError

from fibre_sim.photoelastic import (
    PandaFieldMapCalculationError,
    PandaFieldMapRequest,
    calculate_panda_field_map,
)

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


def demonstration_material(name: str, cte_per_k: float) -> dict[str, Any]:
    return {
        "name": name,
        "composition": "Demonstration composition",
        "young_modulus_pa": 72.0e9,
        "poisson_ratio": 0.17,
        "cte_per_k": cte_per_k,
        "refractive_index": 1.45,
        "p11": 0.121,
        "p12": 0.27,
        "c1_per_pa": None,
        "c2_per_pa": None,
        "photoelastic_convention": "p11_p12_strain",
        "source": {
            "citation": "Local API demonstration values",
            "confidence": "demonstration_only",
            "source_date": None,
            "notes": "Not manufacturer data.",
        },
    }


def valid_payload() -> dict[str, Any]:
    cladding_cte = 5.5e-7
    return {
        "geometry": {
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
        },
        "materials": {
            "core": demonstration_material("Core", cladding_cte),
            "cladding": demonstration_material("Cladding", cladding_cte),
            "sap_1": demonstration_material("SAP 1", 1.2e-6),
            "sap_2": demonstration_material("SAP 2", 1.2e-6),
        },
        "thermal": {
            "temperature_k": 293.15,
            "effective_fictive_temperature_k": 1473.15,
        },
        "wavelength_m": 1.55e-6,
        "sampling": {
            "grid_half_width_m": 62.5e-6,
            "grid_points": 9,
            "interface_buffer_m": 1.0e-6,
        },
    }


def assert_square_grid(values: object, size: int) -> None:
    assert isinstance(values, list)
    assert len(values) == size
    assert all(isinstance(row, list) and len(row) == size for row in values)


async def test_panda_field_map_returns_qualitative_metadata_and_masks(
    client: httpx2.AsyncClient,
) -> None:
    payload = valid_payload()
    request = PandaFieldMapRequest.model_validate(payload)

    response = await client.post(
        "/api/v1/photoelastic/panda/field-map",
        json=payload,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    expected = calculate_panda_field_map(request)
    assert body == json.loads(expected.model_dump_json())

    manifest = body["model_manifest"]
    assert manifest["method"] == "qualitative_far_field_kernel"
    assert manifest["quantity_type"] == "normalized_dimensionless_kernel"
    assert manifest["normalization"] == "max_valid_principal_difference"
    assert manifest["quantitative"] is False
    assert manifest["units"] == "1"
    assert_square_grid(body["normalized_deviatoric_difference_kernel"], 9)
    assert_square_grid(body["validity_mask"], 9)
    assert any(
        value is None for row in body["normalized_deviatoric_difference_kernel"] for value in row
    )
    assert manifest["units"] != "Pa"
    assert "pascal" not in manifest["quantity_type"].lower()
    assert not any(key.endswith("_pa") or "_pa_" in key for key in body if key != "configuration")


async def test_repeated_panda_field_map_requests_are_deterministic(
    client: httpx2.AsyncClient,
) -> None:
    payload = valid_payload()

    first = await client.post("/api/v1/photoelastic/panda/field-map", json=payload)
    second = await client.post("/api/v1/photoelastic/panda/field-map", json=payload)

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.content == second.content


@pytest.mark.parametrize("zero_case", ["equal_cte", "temperature_equals_fictive"])
async def test_zero_kernel_returns_structured_calculation_error(
    client: httpx2.AsyncClient,
    zero_case: str,
) -> None:
    payload = valid_payload()
    if zero_case == "equal_cte":
        cladding_cte = payload["materials"]["cladding"]["cte_per_k"]
        payload["materials"]["sap_1"]["cte_per_k"] = cladding_cte
        payload["materials"]["sap_2"]["cte_per_k"] = cladding_cte
    else:
        payload["thermal"]["temperature_k"] = payload["thermal"]["effective_fictive_temperature_k"]

    request = PandaFieldMapRequest.model_validate(payload)
    with pytest.raises(PandaFieldMapCalculationError) as captured:
        calculate_panda_field_map(request)

    trace_id = f"panda-{zero_case}-trace"
    response = await client.post(
        "/api/v1/photoelastic/panda/field-map",
        json=payload,
        headers={"X-Trace-ID": trace_id},
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "CALCULATION_ERROR"
    assert error["message"] == (
        "Qualitative PANDA field map could not be normalized from the supplied values."
    )
    assert error["field"] is None
    assert error["details"] == {"reason": captured.value.reason}
    assert error["trace_id"] == trace_id
    assert response.headers["X-Trace-ID"] == trace_id


async def test_invalid_panda_field_map_request_returns_request_error(
    client: httpx2.AsyncClient,
) -> None:
    payload = {**valid_payload(), "unexpected": "value"}
    trace_id = "panda-request-validation-trace"

    response = await client.post(
        "/api/v1/photoelastic/panda/field-map",
        json=payload,
        headers={"X-Trace-ID": trace_id},
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "REQUEST_VALIDATION_ERROR"
    assert error["message"] == "Request validation failed"
    assert error["field"] is None
    assert any(
        detail["loc"] == ["body", "unexpected"] and detail["type"] == "extra_forbidden"
        for detail in error["details"]["errors"]
    )
    assert error["trace_id"] == trace_id
    assert response.headers["X-Trace-ID"] == trace_id


@pytest.mark.parametrize("error_kind", ["validation", "overflow"])
async def test_internal_numeric_errors_use_non_finite_calculation_reason(
    client: httpx2.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    error_kind: str,
) -> None:
    def fail(_: PandaFieldMapRequest) -> NoReturn:
        if error_kind == "validation":
            try:
                PandaFieldMapRequest.model_validate({})
            except ValidationError:
                raise
            raise AssertionError("validation error expected")
        raise OverflowError("internal numeric overflow")

    monkeypatch.setattr(main, "calculate_panda_field_map", fail)

    response = await client.post(
        "/api/v1/photoelastic/panda/field-map",
        json=valid_payload(),
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "CALCULATION_ERROR"
    assert error["details"] == {"reason": "non_finite_result"}
    assert "internal numeric overflow" not in response.text
    assert "ValidationError" not in response.text
