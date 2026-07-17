import math

import pytest
from pydantic import ValidationError

from fibre_sim.modes import (
    DEFAULT_GRID_POINTS,
    MAX_GRID_POINTS,
    MIN_GRID_POINTS,
    GaussianModeProfileRequest,
)


def valid_request_values() -> dict[str, object]:
    return {
        "mode_field_radius_um": 4.82,
        "grid_half_width_um": 15.0,
        "grid_points": DEFAULT_GRID_POINTS,
    }


def test_request_has_exact_fields_and_defaults() -> None:
    request = GaussianModeProfileRequest(
        mode_field_radius_um=4.82,
        grid_half_width_um=15.0,
    )

    assert list(GaussianModeProfileRequest.model_fields) == [
        "mode_field_radius_um",
        "grid_half_width_um",
        "grid_points",
    ]
    assert request.mode_field_radius_um == 4.82
    assert request.grid_half_width_um == 15.0
    assert request.grid_points == DEFAULT_GRID_POINTS == 65


def test_request_serializes_deterministically() -> None:
    values = valid_request_values()
    first = GaussianModeProfileRequest.model_validate(values)
    second = GaussianModeProfileRequest.model_validate(values)

    assert first == second
    assert first.model_dump() == values
    assert first.model_dump_json() == (
        '{"mode_field_radius_um":4.82,"grid_half_width_um":15.0,"grid_points":65}'
    )


@pytest.mark.parametrize("grid_points", [MIN_GRID_POINTS, MAX_GRID_POINTS])
def test_request_accepts_grid_bounds(grid_points: int) -> None:
    values = valid_request_values()
    values["grid_points"] = grid_points

    request = GaussianModeProfileRequest.model_validate(values)

    assert request.grid_points == grid_points


@pytest.mark.parametrize("grid_points", [MIN_GRID_POINTS - 1, MAX_GRID_POINTS + 1])
def test_request_rejects_grid_points_outside_bounds(grid_points: int) -> None:
    values = valid_request_values()
    values["grid_points"] = grid_points

    with pytest.raises(ValidationError) as exc_info:
        GaussianModeProfileRequest.model_validate(values)

    assert exc_info.value.errors()[0]["type"] in {"greater_than_equal", "less_than_equal"}


@pytest.mark.parametrize("grid_points", [4, 64])
def test_request_rejects_even_grid_points_with_stable_error(grid_points: int) -> None:
    values = valid_request_values()
    values["grid_points"] = grid_points

    with pytest.raises(ValidationError) as exc_info:
        GaussianModeProfileRequest.model_validate(values)

    error = exc_info.value.errors()[0]
    assert error["type"] == "grid_points_must_be_odd"
    assert error["msg"] == "Grid points must be odd so the sampling grid contains the origin."


@pytest.mark.parametrize("grid_points", [65.0, True, False])
def test_request_rejects_non_integer_grid_points(grid_points: object) -> None:
    values = valid_request_values()
    values["grid_points"] = grid_points

    with pytest.raises(ValidationError) as exc_info:
        GaussianModeProfileRequest.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "int_type"


@pytest.mark.parametrize("field", ["mode_field_radius_um", "grid_half_width_um"])
@pytest.mark.parametrize("value", [0.0, -1.0])
def test_request_dimensions_must_be_positive(field: str, value: float) -> None:
    values = valid_request_values()
    values[field] = value

    with pytest.raises(ValidationError) as exc_info:
        GaussianModeProfileRequest.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "greater_than"


@pytest.mark.parametrize("field", ["mode_field_radius_um", "grid_half_width_um"])
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_request_dimensions_must_be_finite(field: str, value: float) -> None:
    values = valid_request_values()
    values[field] = value

    with pytest.raises(ValidationError) as exc_info:
        GaussianModeProfileRequest.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "finite_number"


def test_request_rejects_unknown_fields() -> None:
    values = valid_request_values()
    values["unexpected"] = 1.0

    with pytest.raises(ValidationError) as exc_info:
        GaussianModeProfileRequest.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "extra_forbidden"


def test_request_is_frozen() -> None:
    request = GaussianModeProfileRequest.model_validate(valid_request_values())

    with pytest.raises(ValidationError) as exc_info:
        request.grid_half_width_um = 16.0

    assert exc_info.value.errors()[0]["type"] == "frozen_instance"


def test_request_json_schema_is_exact_and_descriptive() -> None:
    schema = GaussianModeProfileRequest.model_json_schema()

    assert list(schema["properties"]) == [
        "mode_field_radius_um",
        "grid_half_width_um",
        "grid_points",
    ]
    assert schema["required"] == ["mode_field_radius_um", "grid_half_width_um"]
    assert schema["additionalProperties"] is False

    radius_schema = schema["properties"]["mode_field_radius_um"]
    assert radius_schema["type"] == "number"
    assert radius_schema["exclusiveMinimum"] == 0
    radius_description = radius_schema["description"].lower()
    assert "1/e" in radius_description
    assert "field radius" in radius_description

    half_width_schema = schema["properties"]["grid_half_width_um"]
    assert half_width_schema["type"] == "number"
    assert half_width_schema["exclusiveMinimum"] == 0
    grid_description = half_width_schema["description"].lower()
    assert "centered" in grid_description
    assert "square" in grid_description
    assert "grid" in grid_description

    grid_schema = schema["properties"]["grid_points"]
    assert grid_schema["type"] == "integer"
    assert grid_schema["default"] == DEFAULT_GRID_POINTS == 65
    assert grid_schema["minimum"] == MIN_GRID_POINTS == 3
    assert grid_schema["maximum"] == MAX_GRID_POINTS == 65
