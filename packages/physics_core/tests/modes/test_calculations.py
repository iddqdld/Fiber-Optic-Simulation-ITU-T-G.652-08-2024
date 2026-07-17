import json
import math

import pytest

from fibre_sim.modes import (
    GaussianModeProfileManifest,
    GaussianModeProfileRequest,
    GaussianModeProfileResult,
    calculate_gaussian_mode_profile,
)


def make_request(
    mode_field_radius_um: float,
    grid_half_width_um: float,
    grid_points: int = 65,
) -> GaussianModeProfileRequest:
    return GaussianModeProfileRequest(
        mode_field_radius_um=mode_field_radius_um,
        grid_half_width_um=grid_half_width_um,
        grid_points=grid_points,
    )


def assert_positive_zero(value: float) -> None:
    assert value == 0.0
    assert math.copysign(1.0, value) == 1.0


def test_calculation_returns_result_and_propagates_request_and_manifest() -> None:
    request = make_request(4.82, 15.0)

    result = calculate_gaussian_mode_profile(request)

    assert isinstance(result, GaussianModeProfileResult)
    assert result.mode_field_radius_um == request.mode_field_radius_um
    assert result.grid_half_width_um == request.grid_half_width_um
    assert result.grid_points == request.grid_points
    assert result.model_manifest == GaussianModeProfileManifest()
    assert result.model_manifest.model_dump_json() == (
        GaussianModeProfileManifest().model_dump_json()
    )


def test_five_point_grid_has_exact_centered_axes() -> None:
    result = calculate_gaussian_mode_profile(make_request(1.0, 2.0, 5))
    expected_axis = (-2.0, -1.0, 0.0, 1.0, 2.0)

    assert result.x_um == expected_axis
    assert result.y_um == expected_axis
    assert result.x_um[0] == -2.0
    assert result.x_um[-1] == 2.0
    assert result.y_um[0] == -2.0
    assert result.y_um[-1] == 2.0
    assert_positive_zero(result.x_um[2])
    assert_positive_zero(result.y_um[2])


def test_default_grid_has_exact_endpoints_uniform_spacing_and_equal_axes() -> None:
    result = calculate_gaussian_mode_profile(make_request(4.82, 15.0))
    expected_spacing = 30.0 / 64.0
    x_spacing = tuple(
        right - left for left, right in zip(result.x_um, result.x_um[1:], strict=False)
    )
    y_spacing = tuple(
        right - left for left, right in zip(result.y_um, result.y_um[1:], strict=False)
    )

    assert result.grid_points == 65
    assert len(result.x_um) == result.grid_points
    assert len(result.y_um) == result.grid_points
    assert result.x_um[0] == -15.0
    assert result.x_um[-1] == 15.0
    assert result.y_um[0] == -15.0
    assert result.y_um[-1] == 15.0
    assert_positive_zero(result.x_um[32])
    assert_positive_zero(result.y_um[32])
    assert result.x_um == result.y_um
    assert all(left < right for left, right in zip(result.x_um, result.x_um[1:], strict=False))
    assert all(left < right for left, right in zip(result.y_um, result.y_um[1:], strict=False))
    assert all(
        spacing == pytest.approx(expected_spacing, rel=1e-14, abs=1e-15)
        for spacing in x_spacing + y_spacing
    )


def test_three_point_profile_matches_gaussian_formula_vector() -> None:
    result = calculate_gaussian_mode_profile(make_request(2.0, 2.0, 3))
    field = result.normalized_field
    intensity = result.normalized_intensity

    assert field[1][1] == 1.0
    assert intensity[1][1] == 1.0
    for value in (field[0][1], field[1][0], field[1][2], field[2][1]):
        assert value == pytest.approx(math.exp(-1.0), rel=1e-14, abs=1e-15)
    for value in (intensity[0][1], intensity[1][0], intensity[1][2], intensity[2][1]):
        assert value == pytest.approx(math.exp(-2.0), rel=1e-14, abs=1e-15)
    for value in (field[0][0], field[0][2], field[2][0], field[2][2]):
        assert value == pytest.approx(math.exp(-2.0), rel=1e-14, abs=1e-15)
    for value in (intensity[0][0], intensity[0][2], intensity[2][0], intensity[2][2]):
        assert value == pytest.approx(math.exp(-4.0), rel=1e-14, abs=1e-15)


@pytest.mark.parametrize("grid_points", [3, 5, 65])
def test_profile_values_are_finite_bounded_and_intensity_is_exact_field_square(
    grid_points: int,
) -> None:
    result = calculate_gaussian_mode_profile(make_request(2.3, 6.7, grid_points))

    for field_row, intensity_row in zip(
        result.normalized_field, result.normalized_intensity, strict=True
    ):
        for field_value, intensity_value in zip(field_row, intensity_row, strict=True):
            assert math.isfinite(field_value)
            assert math.isfinite(intensity_value)
            assert 0.0 <= field_value <= 1.0
            assert 0.0 <= intensity_value <= 1.0
            assert intensity_value == field_value * field_value


def test_profile_has_unique_center_maximum_and_radial_symmetries() -> None:
    result = calculate_gaussian_mode_profile(make_request(2.3, 6.7, 5))
    center = result.grid_points // 2

    for profile in (result.normalized_field, result.normalized_intensity):
        maximum = max(max(row) for row in profile)
        maximum_locations = [
            (row_index, column_index)
            for row_index, row in enumerate(profile)
            for column_index, value in enumerate(row)
            if value == maximum
        ]

        assert maximum == 1.0
        assert maximum_locations == [(center, center)]
        for row_index, row in enumerate(profile):
            for column_index, value in enumerate(row):
                assert value == profile[row_index][result.grid_points - column_index - 1]
                assert value == profile[result.grid_points - row_index - 1][column_index]
                assert value == profile[column_index][row_index]


def test_common_positive_scaling_preserves_profile_and_rescales_axes() -> None:
    scale = 3.5
    baseline = calculate_gaussian_mode_profile(make_request(2.0, 6.0, 7))
    scaled = calculate_gaussian_mode_profile(make_request(2.0 * scale, 6.0 * scale, 7))

    assert tuple(value / scale for value in scaled.x_um) == baseline.x_um
    assert tuple(value / scale for value in scaled.y_um) == baseline.y_um
    assert scaled.normalized_field == baseline.normalized_field
    assert scaled.normalized_intensity == baseline.normalized_intensity


def test_repeated_calculation_is_equal_deterministic_and_non_mutating() -> None:
    request = make_request(4.82, 15.0, 5)
    request_before = request.model_dump()

    first = calculate_gaussian_mode_profile(request)
    second = calculate_gaussian_mode_profile(request)

    assert request.model_dump() == request_before
    assert request == GaussianModeProfileRequest.model_validate(request_before)
    assert first == second
    assert first.model_dump_json() == second.model_dump_json()
    assert json.loads(first.model_dump_json()) == first.model_dump(mode="json")


@pytest.mark.parametrize("dimension", [1.0e308, 5.0e-324])
def test_equal_extreme_dimensions_match_analytical_values(dimension: float) -> None:
    result = calculate_gaussian_mode_profile(make_request(dimension, dimension, 3))
    field = result.normalized_field
    intensity = result.normalized_intensity

    assert result.x_um == (-dimension, 0.0, dimension)
    assert result.y_um == (-dimension, 0.0, dimension)
    assert_positive_zero(result.x_um[1])
    assert_positive_zero(result.y_um[1])
    assert field[1][1] == 1.0
    assert intensity[1][1] == 1.0
    for row_index, column_index in ((0, 1), (1, 0), (1, 2), (2, 1)):
        assert field[row_index][column_index] == pytest.approx(math.exp(-1.0), rel=1e-14, abs=1e-15)
        assert intensity[row_index][column_index] == pytest.approx(
            math.exp(-2.0), rel=1e-14, abs=1e-15
        )
    for row_index, column_index in ((0, 0), (0, 2), (2, 0), (2, 2)):
        assert field[row_index][column_index] == pytest.approx(math.exp(-2.0), rel=1e-14, abs=1e-15)
        assert intensity[row_index][column_index] == pytest.approx(
            math.exp(-4.0), rel=1e-14, abs=1e-15
        )
    assert all(math.isfinite(value) for row in field for value in row)
    assert all(math.isfinite(value) for row in intensity for value in row)


def test_huge_grid_and_tiny_radius_underflow_noncentral_cells_to_zero() -> None:
    result = calculate_gaussian_mode_profile(make_request(5.0e-324, 1.0e308, 3))

    for row_index, field_row in enumerate(result.normalized_field):
        for column_index, field_value in enumerate(field_row):
            intensity_value = result.normalized_intensity[row_index][column_index]
            assert math.isfinite(field_value)
            assert math.isfinite(intensity_value)
            if (row_index, column_index) == (1, 1):
                assert field_value == 1.0
                assert intensity_value == 1.0
            else:
                assert field_value == 0.0
                assert intensity_value == 0.0


def test_result_contract_exposes_immutable_tuple_axes_and_matrices() -> None:
    result = calculate_gaussian_mode_profile(make_request(2.0, 2.0, 3))

    assert isinstance(result.x_um, tuple)
    assert isinstance(result.y_um, tuple)
    assert isinstance(result.normalized_field, tuple)
    assert isinstance(result.normalized_intensity, tuple)
    assert all(isinstance(row, tuple) for row in result.normalized_field)
    assert all(isinstance(row, tuple) for row in result.normalized_intensity)
