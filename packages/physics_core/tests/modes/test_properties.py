import json
import math

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from pydantic import ValidationError

from fibre_sim.guidance import GuidanceRequest, numerical_aperture
from fibre_sim.modes import (
    GaussianModeProfileRequest,
    GaussianModeProfileResult,
    approximate_mode_field_radius_um,
    calculate_gaussian_mode_profile,
)


@st.composite
def profile_values(draw: st.DrawFn) -> tuple[float, float, int]:
    return (
        draw(st.floats(1e-6, 1_000.0, allow_nan=False, allow_infinity=False)),
        draw(st.floats(1e-6, 1_000.0, allow_nan=False, allow_infinity=False)),
        draw(st.integers(3, 65).filter(lambda value: value % 2 == 1)),
    )


def profile_request(values: tuple[float, float, int]) -> GaussianModeProfileRequest:
    return GaussianModeProfileRequest(
        mode_field_radius_um=values[0], grid_half_width_um=values[1], grid_points=values[2]
    )


@settings(max_examples=50, derandomize=True, deadline=None)
@given(profile_values())
def test_gaussian_profile_is_bounded_symmetric_and_field_squared(
    values: tuple[float, float, int],
) -> None:
    result = calculate_gaussian_mode_profile(profile_request(values))
    center = result.grid_points // 2

    assert len(result.x_um) == result.grid_points
    assert len(result.y_um) == result.grid_points
    assert result.x_um[center] == 0.0
    assert result.y_um[center] == 0.0
    assert math.copysign(1.0, result.x_um[center]) == 1.0
    assert math.copysign(1.0, result.y_um[center]) == 1.0
    assert result.x_um[0] == -result.x_um[-1] == -result.grid_half_width_um
    assert result.y_um[0] == -result.y_um[-1] == -result.grid_half_width_um
    assert result.x_um == result.y_um
    assert all(
        left == -right for left, right in zip(result.x_um, reversed(result.x_um), strict=True)
    )

    for row_index, row in enumerate(result.normalized_field):
        for column_index, field_value in enumerate(row):
            intensity_value = result.normalized_intensity[row_index][column_index]
            assert math.isfinite(field_value)
            assert math.isfinite(intensity_value)
            assert 0.0 <= field_value <= 1.0
            assert 0.0 <= intensity_value <= 1.0
            assert intensity_value == field_value * field_value
            assert (
                field_value
                == result.normalized_field[result.grid_points - row_index - 1][column_index]
            )
            assert (
                field_value
                == result.normalized_field[row_index][result.grid_points - column_index - 1]
            )

    assert result.normalized_field[center][center] == 1.0
    assert result.normalized_intensity[center][center] == 1.0
    assert result.normalized_field[center][0] <= 1.0
    assert result.normalized_field[0][0] <= result.normalized_field[center][0]


@settings(max_examples=50, derandomize=True, deadline=None)
@given(profile_values())
def test_gaussian_profile_endpoints_follow_the_gaussian_formula(
    values: tuple[float, float, int],
) -> None:
    result = calculate_gaussian_mode_profile(profile_request(values))
    half_width = result.grid_half_width_um
    radius = result.mode_field_radius_um

    axis_end = math.exp(-((half_width / radius) ** 2))
    corner = math.exp(-2.0 * ((half_width / radius) ** 2))

    assert result.normalized_field[result.grid_points // 2][0] == pytest.approx(
        axis_end, rel=1e-12, abs=1e-15
    )
    assert result.normalized_field[0][0] == pytest.approx(corner, rel=1e-12, abs=1e-15)


@settings(max_examples=50, derandomize=True, deadline=None)
@given(profile_values())
def test_gaussian_profile_repeated_calls_and_json_round_trip_are_stable(
    values: tuple[float, float, int],
) -> None:
    request = profile_request(values)
    first = calculate_gaussian_mode_profile(request)
    second = calculate_gaussian_mode_profile(request)

    assert first == second
    assert first.model_dump_json() == second.model_dump_json()
    assert (
        GaussianModeProfileRequest.model_validate(json.loads(request.model_dump_json())) == request
    )
    assert GaussianModeProfileResult.model_validate(json.loads(first.model_dump_json())) == first


@st.composite
def ordered_valid_v_values(draw: st.DrawFn) -> tuple[float, float]:
    first_units = draw(st.integers(1201, 2398))
    second_units = draw(st.integers(first_units + 1, 2399))
    return first_units / 1000.0, second_units / 1000.0


def mode_field_request() -> GuidanceRequest:
    return GuidanceRequest(
        n_core=1.45,
        n_cladding=1.444,
        core_radius_um=4.1,
        wavelength_nm=1550.0,
    )


def request_for_v(value: float) -> GuidanceRequest:
    request = mode_field_request()
    radius = value * request.wavelength_nm / (2.0 * math.pi * 1_000.0 * numerical_aperture(request))
    return request.model_copy(update={"core_radius_um": radius})


@settings(max_examples=50, derandomize=True)
@given(st.floats(1.2001, 2.3999, allow_nan=False, allow_infinity=False))
def test_mode_field_radius_accepts_every_finite_value_inclusive_interval(value: float) -> None:
    result = approximate_mode_field_radius_um(request_for_v(value))

    assert math.isfinite(result)
    assert result > 0.0


@settings(max_examples=50, derandomize=True)
@given(ordered_valid_v_values())
def test_mode_field_radius_formula_decreases_with_v(values: tuple[float, float]) -> None:
    first_request = request_for_v(values[0])
    second_request = request_for_v(values[1])
    first = approximate_mode_field_radius_um(first_request) / first_request.core_radius_um
    second = approximate_mode_field_radius_um(second_request) / second_request.core_radius_um

    assert first > second


@pytest.mark.parametrize(
    "value",
    [
        None,
        "not-a-number",
        [],
        {},
        math.nan,
        math.inf,
        -math.inf,
    ],
)
def test_profile_request_rejects_malformed_and_nonfinite_values(value: object) -> None:
    with pytest.raises(ValidationError):
        GaussianModeProfileRequest.model_validate(
            {
                "mode_field_radius_um": value,
                "grid_half_width_um": 15.0,
                "grid_points": 3,
            }
        )


@pytest.mark.parametrize(
    "field",
    [
        "mode_field_radius_um",
        "grid_half_width_um",
        "grid_points",
        "x_um",
        "y_um",
        "normalized_field",
        "normalized_intensity",
    ],
)
@pytest.mark.parametrize("value", [None, "not-a-number", [], {}])
def test_profile_result_rejects_malformed_values(field: str, value: object) -> None:
    result = calculate_gaussian_mode_profile(
        GaussianModeProfileRequest(
            mode_field_radius_um=2.0,
            grid_half_width_um=2.0,
            grid_points=3,
        )
    )
    values = result.model_dump()
    values[field] = value

    with pytest.raises(ValidationError):
        GaussianModeProfileResult.model_validate(values)
