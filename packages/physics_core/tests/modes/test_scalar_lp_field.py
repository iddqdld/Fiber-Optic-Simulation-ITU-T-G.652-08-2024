import math

import pytest

from fibre_sim.modes import (
    ScalarLPModeCalculationError,
    ScalarLPModeFieldRequest,
    calculate_scalar_lp_mode_field,
)

BASE_PARAMETERS = {
    "wavelength_m": 1.55e-6,
    "n_core": 1.45,
    "n_cladding": 1.444,
}


def field_request(
    *,
    v_number: float,
    azimuthal_order: int,
    radial_order: int,
    grid_half_width_m: float,
    grid_points: int = 9,
) -> ScalarLPModeFieldRequest:
    index_difference = (BASE_PARAMETERS["n_core"] ** 2 - BASE_PARAMETERS["n_cladding"] ** 2) ** 0.5
    core_radius_m = v_number * BASE_PARAMETERS["wavelength_m"] / (2.0 * math.pi * index_difference)
    return ScalarLPModeFieldRequest(
        **BASE_PARAMETERS,
        core_radius_m=core_radius_m,
        azimuthal_order=azimuthal_order,
        radial_order=radial_order,
        grid_half_width_m=grid_half_width_m,
        grid_points=grid_points,
    )


def test_lp11_field_has_signed_symmetry_and_a_central_node() -> None:
    result = calculate_scalar_lp_mode_field(
        field_request(
            v_number=5.0,
            azimuthal_order=1,
            radial_order=1,
            grid_half_width_m=15e-6,
        )
    )
    center = result.grid_points // 2
    field = result.normalized_field

    assert result.selected_mode.label == "LP11"
    assert field[center][center] == 0.0
    assert field[center][center - 1] < 0.0 < field[center][center + 1]
    assert field[center][center - 1] == pytest.approx(-field[center][center + 1])
    for row_index, row in enumerate(field):
        reverse_row_index = result.grid_points - row_index - 1
        for column_index, value in enumerate(row):
            reverse_column_index = result.grid_points - column_index - 1
            assert value == pytest.approx(field[reverse_row_index][column_index])
            assert value == pytest.approx(-field[row_index][reverse_column_index])
    assert all(abs(field[row_index][center]) < 1e-14 for row_index in range(result.grid_points))


def test_lp01_field_is_symmetric_and_has_a_positive_center() -> None:
    result = calculate_scalar_lp_mode_field(
        field_request(
            v_number=2.0,
            azimuthal_order=0,
            radial_order=1,
            grid_half_width_m=8e-6,
        )
    )
    center = result.grid_points // 2
    field = result.normalized_field

    assert result.selected_mode.label == "LP01"
    assert field[center][center] == 1.0
    assert field[center][center] > 0.0
    assert all(value >= 0.0 for row in field for value in row)
    for row_index, row in enumerate(field):
        for column_index, value in enumerate(row):
            assert value == pytest.approx(field[result.grid_points - row_index - 1][column_index])
            assert value == pytest.approx(field[row_index][result.grid_points - column_index - 1])
            assert value == pytest.approx(field[column_index][row_index])


@pytest.mark.parametrize(
    "v_number,azimuthal_order,radial_order,grid_half_width_m",
    [
        (2.0, 0, 1, 8e-6),
        (5.0, 1, 1, 15e-6),
        (8.0, 0, 2, 20e-6),
    ],
)
def test_normalized_field_and_intensity_stay_in_the_exact_unit_range(
    v_number: float,
    azimuthal_order: int,
    radial_order: int,
    grid_half_width_m: float,
) -> None:
    result = calculate_scalar_lp_mode_field(
        field_request(
            v_number=v_number,
            azimuthal_order=azimuthal_order,
            radial_order=radial_order,
            grid_half_width_m=grid_half_width_m,
        )
    )
    field_values = [value for row in result.normalized_field for value in row]
    intensity_values = [value for row in result.normalized_intensity for value in row]

    assert max(abs(value) for value in field_values) == 1.0
    assert max(intensity_values) == 1.0
    assert all(-1.0 <= value <= 1.0 for value in field_values)
    assert all(0.0 <= value <= 1.0 for value in intensity_values)


def test_normalized_intensity_is_the_exact_square_of_normalized_field() -> None:
    result = calculate_scalar_lp_mode_field(
        field_request(
            v_number=8.0,
            azimuthal_order=1,
            radial_order=1,
            grid_half_width_m=20e-6,
            grid_points=11,
        )
    )

    for field_row, intensity_row in zip(
        result.normalized_field,
        result.normalized_intensity,
        strict=True,
    ):
        for field_value, intensity_value in zip(field_row, intensity_row, strict=True):
            assert intensity_value == field_value * field_value


def test_field_rejects_a_well_formed_but_unguided_mode() -> None:
    request = field_request(
        v_number=3.0,
        azimuthal_order=0,
        radial_order=2,
        grid_half_width_m=10e-6,
    )

    with pytest.raises(ScalarLPModeCalculationError, match="not guided"):
        calculate_scalar_lp_mode_field(request)
