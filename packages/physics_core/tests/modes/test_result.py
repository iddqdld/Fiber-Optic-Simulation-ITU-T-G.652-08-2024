import json
import math

import pytest
from pydantic import ValidationError

from fibre_sim.modes import (
    MAX_GRID_POINTS,
    MIN_GRID_POINTS,
    GaussianModeProfileManifest,
    GaussianModeProfileRequest,
    GaussianModeProfileResult,
)

AXIS = (-1.0, 0.0, 1.0)
FIELD = (
    (0.2, 0.5, 0.2),
    (0.5, 1.0, 0.5),
    (0.2, 0.5, 0.2),
)
INTENSITY = (
    (0.1, 0.3, 0.1),
    (0.3, 0.8, 0.3),
    (0.1, 0.3, 0.1),
)


def valid_result_values() -> dict[str, object]:
    return {
        "mode_field_radius_um": 4.82,
        "grid_half_width_um": 15.0,
        "grid_points": 3,
        "x_um": AXIS,
        "y_um": AXIS,
        "normalized_field": FIELD,
        "normalized_intensity": INTENSITY,
        "model_manifest": GaussianModeProfileManifest(),
    }


def make_result(**overrides: object) -> GaussianModeProfileResult:
    values = valid_result_values()
    values.update(overrides)
    return GaussianModeProfileResult.model_validate(values)


def test_manifest_has_exact_fields_and_stable_literals() -> None:
    manifest = GaussianModeProfileManifest()

    assert list(GaussianModeProfileManifest.model_fields) == [
        "model_id",
        "model_version",
        "radius_convention",
        "normalization_convention",
        "assumptions",
        "limitations",
    ]
    assert manifest.model_id == "gaussian_lp01_mode_profile"
    assert manifest.model_version == "1.0.0"
    assert manifest.radius_convention == "1/e_field_radius"
    assert manifest.normalization_convention == "unit_peak_field_and_intensity"

    assumptions = " ".join(manifest.assumptions).lower()
    assert "scalar" in assumptions
    assert "circular symmetry" in assumptions or "circularly symmetric" in assumptions
    assert "lp01" in assumptions
    assert "gaussian" in assumptions
    assert "exp(-r^2/w^2)" in assumptions

    limitations = " ".join(manifest.limitations).lower()
    assert "not exact" in limitations or ("not" in limitations and "exact" in limitations)
    assert "eigenmode" in limitations
    assert "radius" in limitations
    assert "inferred" in limitations or "inference" in limitations


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("model_id", "other_model"),
        ("model_version", "2.0.0"),
        ("radius_convention", "1/e_intensity_radius"),
        ("normalization_convention", "unit_peak_power"),
    ],
)
def test_manifest_rejects_alternative_literal_values(field: str, value: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        GaussianModeProfileManifest.model_validate({field: value})

    assert exc_info.value.errors()[0]["type"] == "literal_error"


def test_manifest_collections_are_tuples_and_json_arrays() -> None:
    first = GaussianModeProfileManifest()
    second = GaussianModeProfileManifest()

    assert first == second
    assert isinstance(first.assumptions, tuple)
    assert isinstance(first.limitations, tuple)
    payload = first.model_dump(mode="json")
    assert isinstance(payload["assumptions"], list)
    assert isinstance(payload["limitations"], list)
    assert json.loads(first.model_dump_json()) == payload
    assert first.model_dump_json() == second.model_dump_json()


def test_all_mode_models_reject_extras_and_are_frozen() -> None:
    models = (
        GaussianModeProfileRequest(mode_field_radius_um=4.82, grid_half_width_um=15.0),
        GaussianModeProfileManifest(),
        make_result(),
    )

    for model in models:
        payload = model.model_dump()
        payload["unexpected"] = "forbidden"
        with pytest.raises(ValidationError) as exc_info:
            type(model).model_validate(payload)
        assert exc_info.value.errors()[0]["type"] == "extra_forbidden"

        field_name = next(iter(type(model).model_fields))
        with pytest.raises(ValidationError) as exc_info:
            setattr(model, field_name, model.model_dump()[field_name])
        assert exc_info.value.errors()[0]["type"] == "frozen_instance"


def test_result_has_exact_fields_and_valid_3_by_3_fixture() -> None:
    result = make_result()

    assert list(GaussianModeProfileResult.model_fields) == [
        "mode_field_radius_um",
        "grid_half_width_um",
        "grid_points",
        "x_um",
        "y_um",
        "normalized_field",
        "normalized_intensity",
        "model_manifest",
    ]
    assert result.mode_field_radius_um == 4.82
    assert result.grid_half_width_um == 15.0
    assert result.grid_points == 3
    assert result.x_um == AXIS
    assert result.y_um == AXIS
    assert result.normalized_field == FIELD
    assert result.normalized_intensity == INTENSITY
    assert result.model_manifest == GaussianModeProfileManifest()
    assert isinstance(result.x_um, tuple)
    assert isinstance(result.y_um, tuple)
    assert isinstance(result.normalized_field, tuple)
    assert isinstance(result.normalized_field[0], tuple)
    assert isinstance(result.normalized_intensity, tuple)
    assert isinstance(result.normalized_intensity[0], tuple)


def test_result_serializes_deterministically_with_arrays() -> None:
    first = make_result()
    second = make_result()

    assert first == second
    assert first.model_dump(mode="json") == second.model_dump(mode="json")
    assert first.model_dump_json() == second.model_dump_json()
    payload = first.model_dump(mode="json")
    assert isinstance(payload["x_um"], list)
    assert isinstance(payload["y_um"], list)
    assert isinstance(payload["normalized_field"], list)
    assert isinstance(payload["normalized_field"][0], list)
    assert isinstance(payload["normalized_intensity"], list)
    assert isinstance(payload["model_manifest"]["assumptions"], list)
    assert isinstance(payload["model_manifest"]["limitations"], list)
    assert json.loads(first.model_dump_json()) == payload


@pytest.mark.parametrize("field", ["mode_field_radius_um", "grid_half_width_um"])
@pytest.mark.parametrize("value", [0.0, -1.0])
def test_result_dimensions_must_be_positive(field: str, value: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(**{field: value})

    assert exc_info.value.errors()[0]["type"] == "greater_than"


@pytest.mark.parametrize("field", ["mode_field_radius_um", "grid_half_width_um"])
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_result_dimensions_must_be_finite(field: str, value: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(**{field: value})

    assert exc_info.value.errors()[0]["type"] == "finite_number"


@pytest.mark.parametrize("grid_points", [MIN_GRID_POINTS - 1, MAX_GRID_POINTS + 1])
def test_result_rejects_grid_points_outside_bounds(grid_points: int) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(grid_points=grid_points)

    assert exc_info.value.errors()[0]["type"] in {"greater_than_equal", "less_than_equal"}


def test_result_accepts_maximum_grid_size() -> None:
    axis = tuple(float(index) for index in range(MAX_GRID_POINTS))
    grid = tuple(tuple(0.5 for _ in range(MAX_GRID_POINTS)) for _ in range(MAX_GRID_POINTS))

    result = make_result(
        grid_points=MAX_GRID_POINTS,
        x_um=axis,
        y_um=axis,
        normalized_field=grid,
        normalized_intensity=grid,
    )

    assert result.grid_points == MAX_GRID_POINTS
    assert len(result.normalized_field) == MAX_GRID_POINTS


@pytest.mark.parametrize("grid_points", [4, 64])
def test_result_rejects_even_grid_points_with_stable_error(grid_points: int) -> None:
    axis = tuple(float(index) for index in range(grid_points))
    grid = tuple(tuple(0.5 for _ in range(grid_points)) for _ in range(grid_points))

    with pytest.raises(ValidationError) as exc_info:
        make_result(
            grid_points=grid_points,
            x_um=axis,
            y_um=axis,
            normalized_field=grid,
            normalized_intensity=grid,
        )

    error = exc_info.value.errors()[0]
    assert error["type"] == "grid_points_must_be_odd"
    assert error["msg"] == "Grid points must be odd so the sampling grid contains the origin."


@pytest.mark.parametrize("grid_points", [3.0, True, False])
def test_result_rejects_non_integer_grid_points(grid_points: object) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(grid_points=grid_points)

    assert exc_info.value.errors()[0]["type"] == "int_type"


@pytest.mark.parametrize("field", ["x_um", "y_um"])
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_result_axes_must_be_finite(field: str, value: float) -> None:
    axis = list(AXIS)
    axis[1] = value

    with pytest.raises(ValidationError) as exc_info:
        make_result(**{field: axis})

    assert exc_info.value.errors()[0]["type"] == "finite_number"


@pytest.mark.parametrize("field", ["normalized_field", "normalized_intensity"])
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_result_matrix_values_must_be_finite(field: str, value: float) -> None:
    matrix = [list(row) for row in FIELD]
    matrix[1][1] = value

    with pytest.raises(ValidationError) as exc_info:
        make_result(**{field: matrix})

    assert exc_info.value.errors()[0]["type"] == "finite_number"


@pytest.mark.parametrize("field", ["normalized_field", "normalized_intensity"])
@pytest.mark.parametrize("value", [-0.01, 1.01])
def test_result_matrix_values_must_be_between_zero_and_one(field: str, value: float) -> None:
    matrix = [list(row) for row in FIELD]
    matrix[1][1] = value

    with pytest.raises(ValidationError) as exc_info:
        make_result(**{field: matrix})

    error_type = exc_info.value.errors()[0]["type"]
    assert error_type in {"greater_than_equal", "less_than_equal"}


@pytest.mark.parametrize(
    ("field", "replacement"),
    [
        ("x_um", (0.0, 1.0)),
        ("x_um", (0.0, 1.0, 2.0, 3.0)),
        ("y_um", (0.0, 1.0)),
        ("y_um", (0.0, 1.0, 2.0, 3.0)),
    ],
)
def test_result_rejects_axis_length_mismatches(field: str, replacement: tuple[float, ...]) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(**{field: replacement})

    assert exc_info.value.errors()[0]["type"] == "profile_axis_length_mismatch"


def malformed_grid(field: str, shape: str) -> list[list[float]]:
    grid = [list(row) for row in (FIELD if field == "normalized_field" else INTENSITY)]
    if shape == "too_few_rows":
        return grid[:-1]
    if shape == "too_many_rows":
        return [*grid, list(grid[-1])]
    if shape == "short_row":
        grid[0] = grid[0][:-1]
        return grid
    grid[0] = [*grid[0], 0.5]
    return grid


@pytest.mark.parametrize("field", ["normalized_field", "normalized_intensity"])
@pytest.mark.parametrize("shape", ["too_few_rows", "too_many_rows", "short_row", "long_row"])
def test_result_rejects_matrix_shape_mismatches(field: str, shape: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(**{field: malformed_grid(field, shape)})

    assert exc_info.value.errors()[0]["type"] == "profile_grid_shape_mismatch"


def test_request_and_result_schemas_are_exact() -> None:
    schema = GaussianModeProfileResult.model_json_schema()

    assert list(schema["properties"]) == [
        "mode_field_radius_um",
        "grid_half_width_um",
        "grid_points",
        "x_um",
        "y_um",
        "normalized_field",
        "normalized_intensity",
        "model_manifest",
    ]
    assert schema["required"] == [
        "mode_field_radius_um",
        "grid_half_width_um",
        "grid_points",
        "x_um",
        "y_um",
        "normalized_field",
        "normalized_intensity",
        "model_manifest",
    ]
    assert schema["additionalProperties"] is False

    assert schema["properties"]["mode_field_radius_um"]["type"] == "number"
    assert schema["properties"]["mode_field_radius_um"]["exclusiveMinimum"] == 0
    assert schema["properties"]["grid_half_width_um"]["type"] == "number"
    assert schema["properties"]["grid_half_width_um"]["exclusiveMinimum"] == 0
    grid_schema = schema["properties"]["grid_points"]
    assert grid_schema["maximum"] == MAX_GRID_POINTS
    assert grid_schema["minimum"] == MIN_GRID_POINTS
    assert grid_schema["title"] == "Grid Points"
    assert grid_schema["type"] == "integer"
    assert "default" not in grid_schema
    for field in ("x_um", "y_um", "normalized_field", "normalized_intensity"):
        assert schema["properties"][field]["type"] == "array"
    assert schema["properties"]["model_manifest"]["$ref"] == ("#/$defs/GaussianModeProfileManifest")

    manifest_schema = schema["$defs"]["GaussianModeProfileManifest"]
    assert manifest_schema["additionalProperties"] is False
    manifest_literals = {
        "model_id": "gaussian_lp01_mode_profile",
        "model_version": "1.0.0",
        "radius_convention": "1/e_field_radius",
        "normalization_convention": "unit_peak_field_and_intensity",
    }
    for field, value in manifest_literals.items():
        assert manifest_schema["properties"][field]["const"] == value
        assert manifest_schema["properties"][field]["default"] == value
