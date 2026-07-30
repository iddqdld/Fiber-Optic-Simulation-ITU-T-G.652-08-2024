import math
from collections.abc import Iterable

import pytest
from pydantic import BaseModel, ValidationError

from fibre_sim.photoelastic import (
    CircularSAP,
    FieldMapSamplingConfig,
    MaterialConfidence,
    MaterialSource,
    PandaFieldMapCalculationError,
    PandaFieldMapManifest,
    PandaFieldMapRequest,
    PandaFieldMapResult,
    PandaFieldMapValidity,
    PandaFieldMapWarning,
    PandaFieldMapWarningCode,
    PandaGeometry,
    PandaMaterial,
    PandaMaterialSet,
    PhotoelasticConvention,
    ThermalState,
    calculate_panda_field_map,
)


def source() -> MaterialSource:
    return MaterialSource(
        citation="M1 qualitative demonstration input",
        confidence=MaterialConfidence.DEMONSTRATION_ONLY,
    )


def material(name: str, cte_per_k: float) -> PandaMaterial:
    return PandaMaterial(
        name=name,
        young_modulus_pa=72.0e9,
        poisson_ratio=0.17,
        cte_per_k=cte_per_k,
        refractive_index=1.444,
        p11=0.12,
        p12=0.27,
        photoelastic_convention=PhotoelasticConvention.P11_P12_STRAIN,
        source=source(),
    )


def sap(x_m: float, y_m: float, radius_m: float = 8.0e-6) -> CircularSAP:
    return CircularSAP(radius_m=radius_m, center_x_m=x_m, center_y_m=y_m)


def request(
    *,
    sap_1: CircularSAP | None = None,
    sap_2: CircularSAP | None = None,
    cladding_cte_per_k: float = 5.5e-7,
    sap_1_cte_per_k: float = 2.0e-6,
    sap_2_cte_per_k: float = 2.0e-6,
    temperature_k: float = 293.15,
    fictive_temperature_k: float = 1200.0,
    grid_points: int = 15,
    interface_buffer_m: float = 0.0,
) -> PandaFieldMapRequest:
    cladding = material("cladding", cladding_cte_per_k)
    return PandaFieldMapRequest(
        geometry=PandaGeometry(
            core_radius_m=4.1e-6,
            cladding_radius_m=62.5e-6,
            core_center_x_m=0.0,
            core_center_y_m=0.0,
            sap_1=sap_1 or sap(-30.0e-6, 0.0),
            sap_2=sap_2 or sap(30.0e-6, 0.0),
        ),
        materials=PandaMaterialSet(
            core=material("core", cladding_cte_per_k),
            cladding=cladding,
            sap_1=material("sap 1", sap_1_cte_per_k),
            sap_2=material("sap 2", sap_2_cte_per_k),
        ),
        thermal=ThermalState(
            temperature_k=temperature_k,
            effective_fictive_temperature_k=fictive_temperature_k,
        ),
        wavelength_m=1.55e-6,
        sampling=FieldMapSamplingConfig(
            grid_half_width_m=70.0e-6,
            grid_points=grid_points,
            interface_buffer_m=interface_buffer_m,
        ),
    )


def numeric_values(
    grid: tuple[tuple[float | None, ...], ...],
) -> Iterable[float]:
    return (value for row in grid for value in row if value is not None)


def closest_index(coordinates: tuple[float, ...], target: float) -> int:
    return min(range(len(coordinates)), key=lambda index: abs(coordinates[index] - target))


def axis_difference_mod_pi(actual: float, expected: float) -> float:
    return (actual - expected + math.pi / 2.0) % math.pi - math.pi / 2.0


def assert_optional_grids_close(
    first: tuple[tuple[float | None, ...], ...],
    second: tuple[tuple[float | None, ...], ...],
) -> None:
    for first_row, second_row in zip(first, second, strict=True):
        for first_value, second_value in zip(first_row, second_row, strict=True):
            if first_value is None:
                assert second_value is None
            else:
                assert second_value == pytest.approx(first_value, abs=1.0e-14)


def test_field_map_is_deterministic_and_carries_qualitative_metadata() -> None:
    configuration = request()
    result = calculate_panda_field_map(configuration)

    assert result == calculate_panda_field_map(configuration)
    assert len(result.x_coordinates_m) == configuration.sampling.grid_points
    assert len(result.y_coordinates_m) == configuration.sampling.grid_points
    assert result.x_coordinates_m[0] == -configuration.sampling.grid_half_width_m
    assert result.x_coordinates_m[-1] == configuration.sampling.grid_half_width_m
    assert result.x_coordinates_m[len(result.x_coordinates_m) // 2] == 0.0
    assert all(len(row) == configuration.sampling.grid_points for row in result.validity_mask)
    assert result.validity_mask[0][0] is False
    assert result.normalized_deviatoric_difference_kernel[0][0] is None
    assert result.normalized_shear_kernel[0][0] is None
    assert result.normalized_principal_difference_kernel[0][0] is None
    assert result.principal_axis_angle_rad[0][0] is None
    assert result.kernel_scale > 0.0
    assert all(
        -1.0 <= value <= 1.0
        for value in numeric_values(result.normalized_deviatoric_difference_kernel)
    )
    assert all(-1.0 <= value <= 1.0 for value in numeric_values(result.normalized_shear_kernel))
    assert all(
        0.0 <= value <= 1.0
        for value in numeric_values(result.normalized_principal_difference_kernel)
    )

    expected_mismatch = (2.0e-6 - 5.5e-7) * (1200.0 - 293.15)
    assert result.sap_thermal_mismatch_strains == pytest.approx(
        (expected_mismatch, expected_mismatch)
    )
    assert result.model_manifest.model_id == "panda_qualitative_far_field_kernel"
    assert result.model_manifest.model_version == "1.0.0"
    assert result.model_manifest.method == "qualitative_far_field_kernel"
    assert result.model_manifest.quantity_type == "normalized_dimensionless_kernel"
    assert result.model_manifest.normalization == "max_valid_principal_difference"
    assert result.model_manifest.quantitative is False
    assert result.model_manifest.units == "1"
    assert result.model_manifest.equation_references == (
        "M1-3.3",
        "M1-5.3",
        "M1-5.4",
        "M1-5.5",
        "M1-5.6",
        "M1-5.7",
    )
    assert result.model_manifest.validity.valid_point_count == sum(
        value for row in result.validity_mask for value in row
    )
    assert [warning.code for warning in result.warnings] == [
        PandaFieldMapWarningCode.QUALITATIVE_UNCALIBRATED,
        PandaFieldMapWarningCode.FINITE_CLADDING_APPROXIMATION,
        PandaFieldMapWarningCode.ZERO_INTERFACE_BUFFER,
    ]
    assert "K_i" in result.warnings[0].message


def test_public_result_models_are_frozen_and_forbid_extra_fields() -> None:
    models: tuple[type[BaseModel], ...] = (
        PandaFieldMapWarning,
        PandaFieldMapValidity,
        PandaFieldMapManifest,
        PandaFieldMapResult,
    )
    for model in models:
        assert model.model_config["frozen"] is True
        assert model.model_config["extra"] == "forbid"


def test_result_validator_rejects_invalid_cell_values_and_shapes() -> None:
    result = calculate_panda_field_map(request())
    invalid_payload = result.model_dump()
    invalid_payload["normalized_shear_kernel"] = [
        list(row) for row in result.normalized_shear_kernel
    ]
    invalid_payload["normalized_shear_kernel"][0][0] = 0.0
    with pytest.raises(ValidationError, match="Invalid field-map cells"):
        PandaFieldMapResult.model_validate(invalid_payload)

    shape_payload = result.model_dump()
    shape_payload["validity_mask"] = [list(row) for row in result.validity_mask]
    shape_payload["validity_mask"][0].pop()
    with pytest.raises(ValidationError, match="one cell per x coordinate"):
        PandaFieldMapResult.model_validate(shape_payload)


def test_aligned_saps_have_centerline_symmetry_and_zero_center_shear() -> None:
    result = calculate_panda_field_map(request())
    center = len(result.x_coordinates_m) // 2

    assert result.validity_mask[center][center] is True
    assert result.normalized_shear_kernel[center][center] == 0.0
    assert result.principal_axis_angle_rad[center][center] == 0.0

    for row_index in range(len(result.y_coordinates_m)):
        mirrored_row = len(result.y_coordinates_m) - 1 - row_index
        for column_index in range(len(result.x_coordinates_m)):
            if result.validity_mask[row_index][column_index]:
                mirrored_shear = result.normalized_shear_kernel[mirrored_row][column_index]
                assert mirrored_shear is not None
                assert result.normalized_deviatoric_difference_kernel[row_index][
                    column_index
                ] == pytest.approx(
                    result.normalized_deviatoric_difference_kernel[mirrored_row][column_index],
                    abs=1.0e-14,
                )
                assert result.normalized_shear_kernel[row_index][column_index] == pytest.approx(
                    -mirrored_shear,
                    abs=1.0e-14,
                )


def test_sap_permutation_preserves_the_field() -> None:
    sap_1 = sap(-28.0e-6, 4.0e-6, 7.0e-6)
    sap_2 = sap(24.0e-6, -6.0e-6, 9.0e-6)
    first = calculate_panda_field_map(
        request(
            sap_1=sap_1,
            sap_2=sap_2,
            sap_1_cte_per_k=2.2e-6,
            sap_2_cte_per_k=1.6e-6,
        )
    )
    permuted = calculate_panda_field_map(
        request(
            sap_1=sap_2,
            sap_2=sap_1,
            sap_1_cte_per_k=1.6e-6,
            sap_2_cte_per_k=2.2e-6,
        )
    )

    assert first.validity_mask == permuted.validity_mask
    assert first.kernel_scale == pytest.approx(permuted.kernel_scale, rel=1.0e-14)
    assert_optional_grids_close(
        first.normalized_deviatoric_difference_kernel,
        permuted.normalized_deviatoric_difference_kernel,
    )
    assert_optional_grids_close(
        first.normalized_shear_kernel,
        permuted.normalized_shear_kernel,
    )
    assert_optional_grids_close(
        first.normalized_principal_difference_kernel,
        permuted.normalized_principal_difference_kernel,
    )
    assert first.sap_thermal_mismatch_strains == pytest.approx(
        tuple(reversed(permuted.sap_thermal_mismatch_strains))
    )


def test_global_ninety_degree_rotation_covariance() -> None:
    sap_1 = sap(-28.0e-6, 4.0e-6, 7.0e-6)
    sap_2 = sap(24.0e-6, -6.0e-6, 9.0e-6)
    original = calculate_panda_field_map(request(sap_1=sap_1, sap_2=sap_2))
    rotated = calculate_panda_field_map(
        request(
            sap_1=sap(-sap_1.center_y_m, sap_1.center_x_m, sap_1.radius_m),
            sap_2=sap(-sap_2.center_y_m, sap_2.center_x_m, sap_2.radius_m),
        )
    )
    size = len(original.x_coordinates_m)

    assert rotated.kernel_scale == pytest.approx(original.kernel_scale, rel=1.0e-14)
    for row_index in range(size):
        for column_index in range(size):
            rotated_row = column_index
            rotated_column = size - 1 - row_index
            assert (
                rotated.validity_mask[rotated_row][rotated_column]
                is (original.validity_mask[row_index][column_index])
            )
            if not original.validity_mask[row_index][column_index]:
                continue

            original_deviatoric = original.normalized_deviatoric_difference_kernel[row_index][
                column_index
            ]
            original_shear = original.normalized_shear_kernel[row_index][column_index]
            original_principal = original.normalized_principal_difference_kernel[row_index][
                column_index
            ]
            assert original_deviatoric is not None
            assert original_shear is not None
            assert original_principal is not None
            assert rotated.normalized_deviatoric_difference_kernel[rotated_row][
                rotated_column
            ] == pytest.approx(
                -original_deviatoric,
                abs=1.0e-13,
            )
            assert rotated.normalized_shear_kernel[rotated_row][rotated_column] == pytest.approx(
                -original_shear,
                abs=1.0e-13,
            )
            assert rotated.normalized_principal_difference_kernel[rotated_row][
                rotated_column
            ] == pytest.approx(
                original_principal,
                abs=1.0e-13,
            )
            original_axis = original.principal_axis_angle_rad[row_index][column_index]
            rotated_axis = rotated.principal_axis_angle_rad[rotated_row][rotated_column]
            if original_axis is None:
                assert rotated_axis is None
            else:
                assert rotated_axis is not None
                assert axis_difference_mod_pi(
                    rotated_axis,
                    original_axis + math.pi / 2.0,
                ) == pytest.approx(0.0, abs=1.0e-12)


def test_thirty_degree_rotation_preserves_center_magnitude_and_rotates_axis() -> None:
    angle_rad = math.radians(30.0)
    cosine = math.cos(angle_rad)
    sine = math.sin(angle_rad)
    sap_1 = sap(-28.0e-6, 4.0e-6, 7.0e-6)
    sap_2 = sap(24.0e-6, -6.0e-6, 9.0e-6)

    def rotate(source: CircularSAP) -> CircularSAP:
        return sap(
            cosine * source.center_x_m - sine * source.center_y_m,
            sine * source.center_x_m + cosine * source.center_y_m,
            source.radius_m,
        )

    original = calculate_panda_field_map(request(sap_1=sap_1, sap_2=sap_2))
    rotated = calculate_panda_field_map(request(sap_1=rotate(sap_1), sap_2=rotate(sap_2)))
    center = len(original.x_coordinates_m) // 2
    original_principal = original.normalized_principal_difference_kernel[center][center]
    rotated_principal = rotated.normalized_principal_difference_kernel[center][center]
    original_axis = original.principal_axis_angle_rad[center][center]
    rotated_axis = rotated.principal_axis_angle_rad[center][center]

    assert original_principal is not None
    assert rotated_principal is not None
    assert original_axis is not None
    assert rotated_axis is not None
    assert rotated_principal * rotated.kernel_scale == pytest.approx(
        original_principal * original.kernel_scale,
        rel=1.0e-12,
    )
    assert axis_difference_mod_pi(
        rotated_axis,
        original_axis + angle_rad,
    ) == pytest.approx(0.0, abs=1.0e-12)


@pytest.mark.parametrize(
    "configuration",
    [
        request(sap_1_cte_per_k=5.5e-7, sap_2_cte_per_k=5.5e-7),
        request(temperature_k=1200.0, fictive_temperature_k=1200.0),
    ],
)
def test_zero_mismatch_rejects_unavailable_normalization(
    configuration: PandaFieldMapRequest,
) -> None:
    with pytest.raises(PandaFieldMapCalculationError) as exc_info:
        calculate_panda_field_map(configuration)

    assert exc_info.value.reason == "normalization_unavailable"


def test_no_valid_points_rejects_unavailable_normalization() -> None:
    with pytest.raises(PandaFieldMapCalculationError) as exc_info:
        calculate_panda_field_map(request(interface_buffer_m=200.0e-6))

    assert exc_info.value.reason == "normalization_unavailable"


def test_nonzero_interface_buffer_masks_the_near_interface_region() -> None:
    unbuffered = calculate_panda_field_map(request())
    buffered = calculate_panda_field_map(request(interface_buffer_m=3.0e-6))
    row = closest_index(unbuffered.y_coordinates_m, 0.0)
    column = closest_index(unbuffered.x_coordinates_m, -20.0e-6)

    assert unbuffered.validity_mask[row][column] is True
    assert buffered.validity_mask[row][column] is False
    assert buffered.normalized_deviatoric_difference_kernel[row][column] is None
    assert [warning.code for warning in buffered.warnings] == [
        PandaFieldMapWarningCode.QUALITATIVE_UNCALIBRATED,
        PandaFieldMapWarningCode.FINITE_CLADDING_APPROXIMATION,
    ]


@pytest.mark.parametrize(
    ("x_m", "y_m", "deviatoric_sign", "shear_sign"),
    [
        (-10.0e-6, 10.0e-6, 1.0, 1.0),
        (-20.0e-6, 20.0e-6, -1.0, 1.0),
        (-20.0e-6, -20.0e-6, -1.0, -1.0),
        (-10.0e-6, -10.0e-6, 1.0, -1.0),
    ],
)
def test_principal_axis_uses_atan2_quadrants(
    x_m: float,
    y_m: float,
    deviatoric_sign: float,
    shear_sign: float,
) -> None:
    configuration = request(
        sap_1=sap(-30.0e-6, 0.0, 5.0e-6),
        sap_2=sap(35.0e-6, 0.0, 5.0e-6),
        sap_2_cte_per_k=5.5e-7,
    )
    result = calculate_panda_field_map(configuration)
    row = closest_index(result.y_coordinates_m, y_m)
    column = closest_index(result.x_coordinates_m, x_m)
    deviatoric = result.normalized_deviatoric_difference_kernel[row][column]
    shear = result.normalized_shear_kernel[row][column]
    axis = result.principal_axis_angle_rad[row][column]

    assert deviatoric is not None
    assert shear is not None
    assert axis is not None
    assert math.copysign(1.0, deviatoric) == deviatoric_sign
    assert math.copysign(1.0, shear) == shear_sign
    assert axis == pytest.approx(
        math.atan2(y_m, x_m - configuration.geometry.sap_1.center_x_m),
        abs=1.0e-12,
    )
