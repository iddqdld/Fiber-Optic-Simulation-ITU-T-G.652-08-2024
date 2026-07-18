import json
import math
import sys

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from pydantic import ValidationError

from fibre_sim.guidance import (
    GuidanceRequest,
    GuidanceResult,
    calculate_guidance,
    numerical_aperture,
    v_number,
)


@st.composite
def valid_guidance_values(draw: st.DrawFn) -> dict[str, float]:
    n_cladding = draw(st.floats(0.2, 2.0, allow_nan=False, allow_infinity=False))
    index_contrast = draw(st.floats(0.001, 0.5, allow_nan=False, allow_infinity=False))
    return {
        "n_core": n_cladding + index_contrast,
        "n_cladding": n_cladding,
        "core_radius_um": draw(st.floats(0.01, 100.0, allow_nan=False, allow_infinity=False)),
        "wavelength_nm": draw(st.floats(0.1, 10_000.0, allow_nan=False, allow_infinity=False)),
    }


@st.composite
def ordered_index_values(draw: st.DrawFn) -> tuple[float, float, float]:
    n_cladding = draw(st.floats(0.2, 2.0, allow_nan=False, allow_infinity=False))
    n_core = n_cladding + draw(st.floats(0.001, 0.5, allow_nan=False, allow_infinity=False))
    lower_cladding = n_cladding - draw(st.floats(0.001, 0.1, allow_nan=False, allow_infinity=False))
    return n_core, n_cladding, lower_cladding


@settings(max_examples=75, derandomize=True)
@given(valid_guidance_values(), st.floats(0.001, 100.0, allow_nan=False, allow_infinity=False))
def test_v_number_increases_with_core_radius_and_decreases_with_wavelength(
    values: dict[str, float], delta: float
) -> None:
    request = GuidanceRequest(**values)
    larger_radius_values = {**values, "core_radius_um": values["core_radius_um"] + delta}
    longer_wavelength_values = {**values, "wavelength_nm": values["wavelength_nm"] + delta}

    assert v_number(GuidanceRequest(**larger_radius_values)) > v_number(request)
    assert v_number(GuidanceRequest(**longer_wavelength_values)) < v_number(request)


@settings(max_examples=75, derandomize=True)
@given(
    ordered_index_values(),
    st.floats(0.01, 100.0, allow_nan=False, allow_infinity=False),
    st.floats(0.1, 10_000.0, allow_nan=False, allow_infinity=False),
)
def test_v_number_increases_with_numerical_aperture(
    indices: tuple[float, float, float], radius: float, wavelength: float
) -> None:
    n_core, n_cladding, lower_cladding = indices
    request = GuidanceRequest(
        n_core=n_core,
        n_cladding=n_cladding,
        core_radius_um=radius,
        wavelength_nm=wavelength,
    )
    larger_aperture_request = GuidanceRequest(
        n_core=n_core,
        n_cladding=lower_cladding,
        core_radius_um=radius,
        wavelength_nm=wavelength,
    )

    assert numerical_aperture(larger_aperture_request) > numerical_aperture(request)
    assert v_number(larger_aperture_request) > v_number(request)


@settings(max_examples=50, derandomize=True)
@given(valid_guidance_values())
def test_guidance_request_and_result_json_round_trip(values: dict[str, float]) -> None:
    request = GuidanceRequest.model_validate(values)
    result = calculate_guidance(request)

    assert GuidanceRequest.model_validate(json.loads(request.model_dump_json())) == request
    assert result == GuidanceResult.model_validate(json.loads(result.model_dump_json()))


@pytest.mark.parametrize("field", ["n_core", "n_cladding", "core_radius_um", "wavelength_nm"])
@pytest.mark.parametrize("value", [None, "not-a-number", [], {}])
def test_guidance_request_rejects_malformed_values(field: str, value: object) -> None:
    values: dict[str, object] = {
        "n_core": 1.5,
        "n_cladding": 1.4,
        "core_radius_um": 4.0,
        "wavelength_nm": 1550.0,
    }
    values[field] = value

    with pytest.raises(ValidationError):
        GuidanceRequest.model_validate(values)


@pytest.mark.parametrize(
    "field",
    [
        "critical_angle_deg",
        "numerical_aperture_dimensionless",
        "air_acceptance_angle_deg",
        "relative_index_difference_dimensionless",
        "v_number_dimensionless",
        "approximate_mode_count",
    ],
)
@pytest.mark.parametrize("value", ["not-a-number", [], {}])
def test_guidance_result_rejects_malformed_values(field: str, value: object) -> None:
    result = calculate_guidance(
        GuidanceRequest(
            n_core=1.45,
            n_cladding=1.444,
            core_radius_um=4.0,
            wavelength_nm=1550.0,
        )
    )
    values = result.model_dump()
    values[field] = value

    with pytest.raises(ValidationError):
        GuidanceResult.model_validate(values)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("n_core", sys.float_info.max),
        ("n_cladding", math.nextafter(0.0, math.inf)),
        ("core_radius_um", math.nextafter(0.0, math.inf)),
        ("wavelength_nm", math.nextafter(0.0, math.inf)),
    ],
)
def test_guidance_request_accepts_extreme_finite_values(field: str, value: float) -> None:
    values = {
        "n_core": 1.5,
        "n_cladding": 1.4,
        "core_radius_um": 4.0,
        "wavelength_nm": 1550.0,
    }
    values[field] = value
    if field == "n_cladding":
        values["n_core"] = 1.5
    if field == "n_core":
        values["n_cladding"] = 1.0

    request = GuidanceRequest.model_validate(values)

    assert all(math.isfinite(item) for item in request.model_dump().values())
