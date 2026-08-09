import json
from collections.abc import AsyncIterator
from typing import cast

import httpx2
import pytest
from apps.api.app.main import app

from fibre_sim.bends import (
    MAX_MACROBENDS,
    MarcuseBendLossInput,
    calculate_marcuse_bend_loss,
)
from fibre_sim.level1 import (
    Level1FibreConfig,
    Level1FibrePreset,
    Level1SamplingConfig,
    Level1SectionConfig,
    Level1SimulationRequest,
    Level1SourceConfig,
    calculate_level1_simulation,
)
from fibre_sim.modes import solve_scalar_step_index_lp01
from fibre_sim.standards import G652DAttenuationApplication
from fibre_sim.standards.constants import G652D_MIN_WAVELENGTH_NM

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


def scalar_lp_payload(
    *,
    wavelength_m: float = 1550e-9,
    core_radius_m: float = 6e-6,
    azimuthal_order: int | None = None,
    radial_order: int | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "wavelength_m": wavelength_m,
        "core_radius_m": core_radius_m,
        "n_core": 1.47,
        "n_cladding": 1.465,
    }
    if azimuthal_order is not None:
        payload["azimuthal_order"] = azimuthal_order
    if radial_order is not None:
        payload["radial_order"] = radial_order
    return payload


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
    assert response.json()["model_manifest"]["model_version"] == "1.3.0"
    assert (
        "marcuse_lp01_step_index_macrobend"
        in response.json()["model_manifest"]["component_model_ids"]
    )
    assert "scalar_lp_step_index_modes" in response.json()["model_manifest"]["component_model_ids"]
    assert response.json()["bend_loss"]["model_manifest"]["scientific_label"] == (
        "Estimated LP01 macrobend radiation loss — Marcuse model"
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


async def test_scalar_lp_catalog_returns_exact_labels_without_excitation_claims(
    client: httpx2.AsyncClient,
) -> None:
    response = await client.post(
        "/api/v1/modes/scalar-lp/catalog",
        json=scalar_lp_payload(),
    )

    assert response.status_code == 200
    body = response.json()
    assert [mode["label"] for mode in body["mode_families"]] == ["LP01", "LP11"]
    assert [mode["spatial_degeneracy"] for mode in body["mode_families"]] == [1, 2]
    assert body["mode_regime"] == "multimode"
    assert body["catalog_truncated"] is False
    manifest = body["model_manifest"]
    assert manifest["catalog_label"] == (
        "Supported scalar LP modes — weak-guidance step-index model"
    )
    assert manifest["field_label"] == "Scalar LP mode field — weak-guidance step-index model"
    assert manifest["excitation_status"] == "not_calculated"
    assert {
        "supported modes are not necessarily excited by the source",
        "no launch overlap, modal power, polarization, or mode coupling",
        "no vector electromagnetic components or longitudinal field components",
        "no bend-aware field displacement or radiation pattern",
        "ideal modal cutoffs are not measured G.652.D cable cutoffs",
    }.issubset(set(manifest["limitations"]))
    assert "excited_modes" not in body
    assert "launch_overlap" not in body
    assert "modal_power" not in body


async def test_scalar_lp_field_returns_signed_lp11_field(
    client: httpx2.AsyncClient,
) -> None:
    payload = scalar_lp_payload(azimuthal_order=1, radial_order=1)
    payload.update({"grid_half_width_m": 15e-6, "grid_points": 9})

    response = await client.post(
        "/api/v1/modes/scalar-lp/field",
        json=payload,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["selected_mode"]["label"] == "LP11"
    assert body["selected_mode"]["azimuthal_order"] == 1
    assert body["selected_mode"]["radial_order"] == 1
    assert body["selected_mode"]["spatial_degeneracy"] == 2
    field = body["normalized_field"]
    assert len(field) == len(body["x_m"]) == len(body["y_m"]) == 9
    assert field[4][4] == pytest.approx(0.0, abs=1e-12)
    assert field[4][3] < -0.9
    assert field[4][5] > 0.9
    assert min(value for row in field for value in row) < -0.9
    assert max(value for row in field for value in row) > 0.9
    assert body["model_manifest"]["excitation_status"] == "not_calculated"
    assert body["model_manifest"]["field_normalization"] == "unit_peak_absolute_field"


async def test_scalar_lp_field_rejects_mode_below_ideal_modal_cutoff(
    client: httpx2.AsyncClient,
) -> None:
    payload = scalar_lp_payload(core_radius_m=4.1e-6, azimuthal_order=1, radial_order=1)
    payload.update({"grid_half_width_m": 15e-6, "grid_points": 9})
    trace_id = "scalar-lp-cutoff"

    response = await client.post(
        "/api/v1/modes/scalar-lp/field",
        json=payload,
        headers={"X-Trace-ID": trace_id},
    )

    assert response.status_code == 422
    assert response.json() == {
        "error": {
            "code": "CALCULATION_ERROR",
            "message": "The selected scalar LP mode field is unavailable for these inputs.",
            "field": None,
            "details": {"reason": "scalar_lp_mode_field_unavailable"},
            "trace_id": trace_id,
        }
    }
    assert response.headers["X-Trace-ID"] == trace_id


async def test_scalar_lp_modal_cutoff_is_separate_from_g652_cable_cutoff(
    client: httpx2.AsyncClient,
) -> None:
    wavelength_nm = G652D_MIN_WAVELENGTH_NM - 1.0
    response = await client.post(
        "/api/v1/modes/scalar-lp/catalog",
        json=scalar_lp_payload(wavelength_m=wavelength_nm * 1e-9, core_radius_m=4.1e-6),
    )

    assert response.status_code == 200
    body = response.json()
    assert [mode["label"] for mode in body["mode_families"]] == ["LP01", "LP11"]
    lp11 = body["mode_families"][1]
    assert body["v_number_dimensionless"] > lp11["cutoff_v_dimensionless"]
    assert (
        "ideal modal cutoffs are not measured G.652.D cable cutoffs"
        in body["model_manifest"]["limitations"]
    )


async def test_marcuse_endpoint_matches_the_approved_synthetic_fixture(
    client: httpx2.AsyncClient,
) -> None:
    mode = solve_scalar_step_index_lp01(
        wavelength_m=1.625e-6,
        core_radius_m=4.1e-6,
        n_core=1.4504,
        n_cladding=1.4447,
    )
    request = MarcuseBendLossInput(
        wavelength_m=1.625e-6,
        core_radius_m=4.1e-6,
        cladding_radius_m=62.5e-6,
        n_core=1.4504,
        n_cladding=1.4447,
        beta_per_m=mode.beta_per_m,
        bend_radius_m=0.015,
    )

    response = await client.post(
        "/api/v1/bends/marcuse/calculate",
        json=request.model_dump(mode="json"),
    )

    assert response.status_code == 200
    assert response.json() == json.loads(calculate_marcuse_bend_loss(request).model_dump_json())
    assert response.json()["alpha_power_per_m"] == pytest.approx(0.1846161533, rel=1e-9)


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
                "direction": "left",
            },
            {
                "position_fraction": 0.7,
                "radius_mm": 12.0,
                "angle_deg": 90.0,
                "direction": "right",
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
    bend_loss = body["bend_loss"]
    assert bend_loss["total_bend_loss_db"] == pytest.approx(
        sum(point["estimated_radiation_loss_db"] for point in bend_loss["bends"])
    )
    assert bend_loss["output_power_dbm"] == pytest.approx(
        bend_loss["input_power_dbm"] - bend_loss["total_bend_loss_db"]
    )


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
                },
                {
                    "position_fraction": 0.5,
                    "radius_mm": 12.0,
                    "angle_deg": 90.0,
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
