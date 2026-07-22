import asyncio
import json
import math
from collections.abc import AsyncIterator
from typing import Any

import httpx2
import pytest
from apps.api.app.main import app
from hypothesis import given, settings
from hypothesis import strategies as st

from fibre_sim.bends import MAX_MACROBENDS
from fibre_sim.level1 import Level1SimulationRequest, Level1SimulationResult
from fibre_sim.modes import MAX_GRID_POINTS, MIN_GRID_POINTS
from fibre_sim.standards.constants import G652D_MAX_WAVELENGTH_NM, G652D_MIN_WAVELENGTH_NM

Payload = dict[str, Any]
ODD_GRID_POINTS = st.integers(min_value=MIN_GRID_POINTS, max_value=MAX_GRID_POINTS).filter(
    lambda value: value % 2 == 1
)

REQUIRED_PATHS = (
    ("preset",),
    ("fibre",),
    ("source",),
    ("section",),
    ("sampling",),
    ("fibre", "n_core"),
    ("fibre", "n_cladding"),
    ("fibre", "core_radius_um"),
    ("fibre", "mode_field_radius_um"),
    ("fibre", "attenuation_db_per_km"),
    ("fibre", "dispersion_ps_per_nm_km"),
    ("fibre", "group_index_dimensionless"),
    ("fibre", "cable_application"),
    ("source", "wavelength_nm"),
    ("source", "input_power_dbm"),
    ("source", "spectral_width_fwhm_nm"),
    ("source", "input_pulse_fwhm_ps"),
    ("section", "length_km"),
    ("sampling", "grid_half_width_um"),
)

EXTRA_CONTAINER_PATHS = (("root",), ("fibre",), ("source",), ("section",), ("sampling",))

STRICT_NUMERIC_PATHS = (
    ("fibre", "n_core"),
    ("fibre", "n_cladding"),
    ("fibre", "core_radius_um"),
    ("fibre", "mode_field_radius_um"),
    ("fibre", "attenuation_db_per_km"),
    ("fibre", "dispersion_ps_per_nm_km"),
    ("fibre", "group_index_dimensionless"),
    ("source", "wavelength_nm"),
    ("source", "input_power_dbm"),
    ("source", "spectral_width_fwhm_nm"),
    ("source", "input_pulse_fwhm_ps"),
    ("section", "length_km"),
    ("sampling", "grid_half_width_um"),
    ("sampling", "grid_points"),
)

FINITE_NUMERIC_PATHS = tuple(path for path in STRICT_NUMERIC_PATHS if path[-1] != "grid_points")

PATH_IDS = {path: ".".join(path) for path in (*REQUIRED_PATHS, *STRICT_NUMERIC_PATHS)}


def valid_payload(
    *, preset: str = "custom", wavelength_nm: float = 1550.0, grid_points: int | None = None
) -> Payload:
    sampling: Payload = {"grid_half_width_um": 15.0}
    if grid_points is not None:
        sampling["grid_points"] = grid_points
    return {
        "preset": preset,
        "fibre": {
            "n_core": 1.47,
            "n_cladding": 1.465,
            "core_radius_um": 4.1,
            "mode_field_radius_um": 4.82,
            "attenuation_db_per_km": 0.2,
            "dispersion_ps_per_nm_km": 17.0,
            "group_index_dimensionless": 1.468,
            "cable_application": "standard_cable",
        },
        "source": {
            "wavelength_nm": wavelength_nm,
            "input_power_dbm": -3.0,
            "spectral_width_fwhm_nm": 0.2,
            "input_pulse_fwhm_ps": 25.0,
        },
        "section": {"length_km": 12.5},
        "sampling": sampling,
    }


def set_path(payload: Payload, path: tuple[str, ...], value: Any) -> None:
    target: Any = payload
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = value


def remove_path(payload: Payload, path: tuple[str, ...]) -> None:
    target: Any = payload
    for part in path[:-1]:
        target = target[part]
    del target[path[-1]]


async def post_json_async(
    payload: object,
    headers: dict[str, str] | None = None,
) -> httpx2.Response:
    transport = httpx2.ASGITransport(app=app)
    async with httpx2.AsyncClient(transport=transport, base_url="http://testserver") as client:
        return await client.post(
            "/api/v1/simulations/preview",
            json=payload,
            headers=headers,
        )


async def post_content_async(
    content: str,
    headers: dict[str, str] | None = None,
) -> httpx2.Response:
    request_headers = {"Content-Type": "application/json"}
    if headers is not None:
        request_headers.update(headers)
    transport = httpx2.ASGITransport(app=app)
    async with httpx2.AsyncClient(transport=transport, base_url="http://testserver") as client:
        return await client.post(
            "/api/v1/simulations/preview",
            content=content,
            headers=request_headers,
        )


def post_json(payload: object, headers: dict[str, str] | None = None) -> httpx2.Response:
    return asyncio.run(post_json_async(payload, headers))


def post_content(content: str, headers: dict[str, str] | None = None) -> httpx2.Response:
    return asyncio.run(post_content_async(content, headers))


def assert_error_response(
    response: httpx2.Response,
    location: tuple[str | int, ...],
    error_type: str | None = None,
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
    assert isinstance(error["trace_id"], str)
    assert error["trace_id"]
    assert response.headers["X-Trace-ID"] == error["trace_id"]
    if trace_id is not None:
        assert error["trace_id"] == trace_id

    details = error["details"]
    assert set(details) == {"errors"}
    errors = details["errors"]
    assert isinstance(errors, list)
    assert errors
    matching_errors = []
    for detail in errors:
        assert isinstance(detail, dict)
        assert isinstance(detail["loc"], list)
        assert isinstance(detail["type"], str)
        assert isinstance(detail["msg"], str)
        if detail["loc"] == ["body", *location]:
            matching_errors.append(detail)
    assert matching_errors
    if error_type is not None:
        assert any(detail["type"] == error_type for detail in matching_errors)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def client() -> AsyncIterator[httpx2.AsyncClient]:
    transport = httpx2.ASGITransport(app=app)
    async with httpx2.AsyncClient(transport=transport, base_url="http://testserver") as test_client:
        yield test_client


@pytest.mark.anyio
@pytest.mark.parametrize(
    "bad_body",
    [None, [], "not an object", 1],
    ids=["null", "array", "string", "number"],
)
async def test_preview_rejects_non_object_json_bodies(
    client: httpx2.AsyncClient,
    bad_body: object,
) -> None:
    response = await client.post(
        "/api/v1/simulations/preview",
        json=bad_body,
        headers={"X-Trace-ID": "level1-root-shape"},
    )

    assert_error_response(response, (), trace_id="level1-root-shape")


@pytest.mark.anyio
async def test_preview_rejects_malformed_json_with_the_standard_error_shape(
    client: httpx2.AsyncClient,
) -> None:
    response = await client.post(
        "/api/v1/simulations/preview",
        content='{"preset":',
        headers={
            "Content-Type": "application/json",
            "X-Trace-ID": "level1-json-invalid",
        },
    )

    assert_error_response(response, (10,), "json_invalid", "level1-json-invalid")


@pytest.mark.parametrize("path", REQUIRED_PATHS, ids=PATH_IDS.get)
def test_preview_rejects_each_required_root_or_nested_field(path: tuple[str, ...]) -> None:
    payload = valid_payload()
    remove_path(payload, path)

    response = post_json(payload)

    assert_error_response(response, path, "missing")


@pytest.mark.parametrize(
    "container_path",
    EXTRA_CONTAINER_PATHS,
    ids=["root", "fibre", "source", "section", "sampling"],
)
def test_preview_forbids_extra_fields_at_each_request_model_level(
    container_path: tuple[str, ...],
) -> None:
    payload = valid_payload()
    expected_path: tuple[str, ...]
    if container_path == ("root",):
        payload["unexpected"] = True
        expected_path = ("unexpected",)
    else:
        set_path(payload, container_path, {**payload[container_path[0]], "unexpected": True})
        expected_path = (*container_path, "unexpected")

    response = post_json(payload)

    assert_error_response(response, expected_path, "extra_forbidden")


@pytest.mark.parametrize("path", STRICT_NUMERIC_PATHS, ids=PATH_IDS.get)
@pytest.mark.parametrize(
    "invalid_value",
    [True, "1.0"],
    ids=["boolean", "numeric-string"],
)
def test_preview_keeps_all_nested_numeric_fields_strict(
    path: tuple[str, ...],
    invalid_value: object,
) -> None:
    payload = valid_payload()
    set_path(payload, path, invalid_value)

    response = post_json(payload)

    assert_error_response(response, path)


@pytest.mark.parametrize("path", FINITE_NUMERIC_PATHS, ids=PATH_IDS.get)
@pytest.mark.parametrize(
    "non_finite_value",
    [math.nan, math.inf, -math.inf],
    ids=["nan", "positive-infinity", "negative-infinity"],
)
def test_preview_rejects_every_non_finite_nested_float(
    path: tuple[str, ...],
    non_finite_value: float,
) -> None:
    payload = valid_payload()
    set_path(payload, path, non_finite_value)

    response = post_content(json.dumps(payload), {"X-Trace-ID": "level1-non-finite"})

    assert_error_response(response, path, "finite_number", "level1-non-finite")


@pytest.mark.parametrize(
    ("path", "invalid_value", "error_type"),
    [
        (("fibre", "n_core"), 0.0, "greater_than"),
        (("fibre", "n_core"), -1.0, "greater_than"),
        (("fibre", "n_cladding"), 0.0, "greater_than"),
        (("fibre", "core_radius_um"), 0.0, "greater_than"),
        (("fibre", "mode_field_radius_um"), 0.0, "greater_than"),
        (("fibre", "group_index_dimensionless"), 0.0, "greater_than"),
        (("source", "wavelength_nm"), 0.0, "greater_than"),
        (("source", "input_pulse_fwhm_ps"), 0.0, "greater_than"),
        (("sampling", "grid_half_width_um"), 0.0, "greater_than"),
        (("fibre", "attenuation_db_per_km"), -1.0, "greater_than_equal"),
        (("source", "spectral_width_fwhm_nm"), -1.0, "greater_than_equal"),
        (("section", "length_km"), -1.0, "greater_than_equal"),
    ],
)
def test_preview_enforces_nested_numeric_bounds(
    path: tuple[str, ...], invalid_value: float, error_type: str
) -> None:
    payload = valid_payload()
    set_path(payload, path, invalid_value)

    response = post_json(payload)

    assert_error_response(response, path, error_type)


@pytest.mark.parametrize(
    ("grid_points", "location", "error_type"),
    [
        (MIN_GRID_POINTS - 1, ("sampling", "grid_points"), "greater_than_equal"),
        (MAX_GRID_POINTS + 1, ("sampling", "grid_points"), "less_than_equal"),
        (4, ("sampling",), "grid_points_must_be_odd"),
        (64, ("sampling",), "grid_points_must_be_odd"),
    ],
)
def test_preview_enforces_grid_bounds_and_oddness(
    grid_points: int, location: tuple[str, ...], error_type: str
) -> None:
    response = post_json(valid_payload(grid_points=grid_points))

    assert_error_response(response, location, error_type)


@pytest.mark.parametrize(
    ("bends", "location", "error_type"),
    [
        (
            [
                {
                    "position_fraction": 0.4,
                    "radius_mm": 12.0,
                    "angle_deg": 90.0,
                    "supplied_loss_db": 0.2,
                },
                {
                    "position_fraction": 0.4,
                    "radius_mm": 12.0,
                    "angle_deg": 90.0,
                    "supplied_loss_db": 0.3,
                },
            ],
            ("section",),
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
            ("section", "bends"),
            "too_long",
        ),
    ],
    ids=["non-increasing-positions", "maximum-bend-count"],
)
def test_preview_rejects_invalid_bend_order_and_limit(
    bends: list[dict[str, object]],
    location: tuple[str, ...],
    error_type: str,
) -> None:
    payload = valid_payload()
    payload["section"]["bends"] = bends

    response = post_json(payload)

    assert_error_response(response, location, error_type)


@pytest.mark.parametrize(
    ("preset", "wavelength_nm", "status"),
    [
        (
            "custom",
            math.nextafter(G652D_MIN_WAVELENGTH_NM, -math.inf),
            200,
        ),
        ("custom", G652D_MIN_WAVELENGTH_NM, 200),
        ("custom", G652D_MAX_WAVELENGTH_NM, 200),
        (
            "custom",
            math.nextafter(G652D_MAX_WAVELENGTH_NM, math.inf),
            200,
        ),
        (
            "g652d",
            math.nextafter(G652D_MIN_WAVELENGTH_NM, -math.inf),
            422,
        ),
        ("g652d", G652D_MIN_WAVELENGTH_NM, 200),
        ("g652d", G652D_MAX_WAVELENGTH_NM, 200),
        (
            "g652d",
            math.nextafter(G652D_MAX_WAVELENGTH_NM, math.inf),
            422,
        ),
    ],
    ids=[
        "custom-below-minimum",
        "custom-at-minimum",
        "custom-at-maximum",
        "custom-above-maximum",
        "g652d-below-minimum",
        "g652d-at-minimum",
        "g652d-at-maximum",
        "g652d-above-maximum",
    ],
)
def test_preview_wavelength_domain_is_owned_only_by_g652d(
    preset: str, wavelength_nm: float, status: int
) -> None:
    response = post_json(valid_payload(preset=preset, wavelength_nm=wavelength_nm))

    assert response.status_code == status
    if preset == "g652d" and status == 422:
        assert_error_response(response, (), "g652d_wavelength_outside_preset_domain")
    else:
        result = Level1SimulationResult.model_validate(response.json())
        assert result.configuration.source.wavelength_nm == wavelength_nm


@pytest.mark.parametrize(
    ("path", "value", "error_type"),
    [
        (("fibre", "n_core"), 1.465, "invalid_refractive_index_order"),
        (("preset",), "unknown", "enum"),
        (("fibre", "cable_application"), "unknown", "enum"),
    ],
    ids=["equal-refractive-indices", "unknown-preset", "unknown-cable-application"],
)
def test_preview_enforces_cross_field_and_enum_constraints(
    path: tuple[str, ...], value: object, error_type: str
) -> None:
    payload = valid_payload()
    set_path(payload, path, value)

    response = post_json(payload)

    expected_path = ("fibre",) if path == ("fibre", "n_core") else path
    assert_error_response(response, expected_path, error_type)


@settings(max_examples=40, derandomize=True, deadline=None)
@given(
    nested_field=st.sampled_from(("fibre", "source", "section", "sampling")),
    replacement=st.one_of(
        st.none(),
        st.integers(min_value=-1, max_value=1),
        st.text(max_size=8),
        st.lists(st.integers(min_value=-1, max_value=1), max_size=2),
    ),
)
def test_preview_rejects_arbitrary_non_object_nested_sections(
    nested_field: str, replacement: object
) -> None:
    payload = valid_payload()
    payload[nested_field] = replacement

    response = post_json(payload)

    assert_error_response(response, (nested_field,))


_SAFE_TRACE_IDS = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.:",
    min_size=1,
    max_size=32,
)


@settings(max_examples=30, derandomize=True, deadline=None)
@given(trace_id=_SAFE_TRACE_IDS)
def test_preview_validation_error_echoes_any_safe_trace_id(trace_id: str) -> None:
    payload = valid_payload()
    payload["unexpected"] = True

    response = post_json(payload, {"X-Trace-ID": trace_id})

    assert_error_response(response, ("unexpected",), "extra_forbidden", trace_id)


@st.composite
def valid_payloads(draw: st.DrawFn) -> Payload:
    preset = draw(st.sampled_from(("custom", "g652d")))
    if preset == "g652d":
        wavelength_nm = draw(
            st.floats(
                min_value=G652D_MIN_WAVELENGTH_NM,
                max_value=G652D_MAX_WAVELENGTH_NM,
                allow_nan=False,
                allow_infinity=False,
            )
        )
    else:
        wavelength_nm = draw(
            st.floats(min_value=0.01, max_value=2000.0, allow_nan=False, allow_infinity=False)
        )
    n_cladding = draw(
        st.floats(min_value=1.40, max_value=1.48, allow_nan=False, allow_infinity=False)
    )
    n_core = n_cladding + draw(
        st.floats(min_value=0.001, max_value=0.10, allow_nan=False, allow_infinity=False)
    )
    grid_points = draw(ODD_GRID_POINTS)
    payload = valid_payload(preset=preset, wavelength_nm=wavelength_nm, grid_points=grid_points)
    payload["fibre"].update(
        {
            "n_core": n_core,
            "n_cladding": n_cladding,
            "core_radius_um": draw(
                st.floats(min_value=0.1, max_value=10.0, allow_nan=False, allow_infinity=False)
            ),
            "mode_field_radius_um": draw(
                st.floats(min_value=0.1, max_value=10.0, allow_nan=False, allow_infinity=False)
            ),
            "attenuation_db_per_km": draw(
                st.floats(min_value=0.0, max_value=2.0, allow_nan=False, allow_infinity=False)
            ),
            "dispersion_ps_per_nm_km": draw(
                st.floats(min_value=-30.0, max_value=30.0, allow_nan=False, allow_infinity=False)
            ),
            "group_index_dimensionless": draw(
                st.floats(min_value=1.0, max_value=2.0, allow_nan=False, allow_infinity=False)
            ),
        }
    )
    payload["source"].update(
        {
            "input_power_dbm": draw(
                st.floats(min_value=-100.0, max_value=100.0, allow_nan=False, allow_infinity=False)
            ),
            "spectral_width_fwhm_nm": draw(
                st.floats(min_value=0.0, max_value=5.0, allow_nan=False, allow_infinity=False)
            ),
            "input_pulse_fwhm_ps": draw(
                st.floats(min_value=0.01, max_value=100.0, allow_nan=False, allow_infinity=False)
            ),
        }
    )
    payload["section"]["length_km"] = draw(
        st.floats(min_value=0.0, max_value=100.0, allow_nan=False, allow_infinity=False)
    )
    payload["sampling"]["grid_half_width_um"] = draw(
        st.floats(min_value=5.0, max_value=30.0, allow_nan=False, allow_infinity=False)
    )
    return payload


@settings(max_examples=16, derandomize=True, deadline=None)
@given(payload=valid_payloads())
def test_valid_preview_round_trips_exactly_through_request_and_result_models(
    payload: Payload,
) -> None:
    response = post_json(payload)

    assert response.status_code == 200
    body = response.json()
    result = Level1SimulationResult.model_validate(body)
    request = Level1SimulationRequest.model_validate(body["configuration"])
    assert set(body) == set(Level1SimulationResult.model_fields)
    assert result.model_dump(mode="json") == body
    assert request.model_dump(mode="json") == body["configuration"]
    assert body["configuration"]["preset"] == payload["preset"]
    assert body["configuration"]["sampling"]["grid_points"] == payload["sampling"]["grid_points"]


@pytest.mark.parametrize("grid_points", range(MIN_GRID_POINTS, MAX_GRID_POINTS + 1, 2))
def test_every_in_range_odd_grid_is_accepted_by_the_preview_boundary(grid_points: int) -> None:
    response = post_json(valid_payload(grid_points=grid_points))

    assert response.status_code == 200
    result = Level1SimulationResult.model_validate(response.json())
    assert len(result.mode_profile.x_um) == grid_points
    assert len(result.mode_profile.normalized_intensity) == grid_points
