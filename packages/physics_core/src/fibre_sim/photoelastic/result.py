import math
from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from .request import PandaFieldMapRequest

_FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]
_PositiveFiniteFloat = Annotated[float, Field(gt=0, allow_inf_nan=False)]
_NonNegativeStrictFiniteFloat = Annotated[
    float,
    Field(strict=True, ge=0, allow_inf_nan=False),
]
_NonNegativeStrictInt = Annotated[int, Field(strict=True, ge=0)]
_StrictText = Annotated[str, Field(strict=True, min_length=1)]
_OptionalFiniteFloat = _FiniteFloat | None
_NORMALIZED_TOLERANCE = 1.0e-12


class PandaFieldMapWarningCode(StrEnum):
    QUALITATIVE_UNCALIBRATED = "qualitative_uncalibrated"
    FINITE_CLADDING_APPROXIMATION = "finite_cladding_approximation"
    ZERO_INTERFACE_BUFFER = "zero_interface_buffer"


class PandaFieldMapWarning(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    code: PandaFieldMapWarningCode
    message: _StrictText
    output_field: _StrictText


class PandaFieldMapValidity(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    outside_cladding_masked: Literal[True] = True
    sap_interiors_masked: Literal[True] = True
    interface_buffer_m: _NonNegativeStrictFiniteFloat
    valid_point_count: _NonNegativeStrictInt


class PandaFieldMapManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["panda_qualitative_far_field_kernel"] = "panda_qualitative_far_field_kernel"
    model_version: Literal["1.0.0"] = "1.0.0"
    method: Literal["qualitative_far_field_kernel"] = "qualitative_far_field_kernel"
    quantity_type: Literal["normalized_dimensionless_kernel"] = "normalized_dimensionless_kernel"
    normalization: Literal["max_valid_principal_difference"] = "max_valid_principal_difference"
    quantitative: Literal[False] = False
    units: Literal["1"] = "1"
    equation_references: tuple[str, ...] = (
        "M1-3.3",
        "M1-5.3",
        "M1-5.4",
        "M1-5.5",
        "M1-5.6",
        "M1-5.7",
    )
    assumptions: tuple[str, ...] = (
        "constant thermal expansion coefficients over the temperature interval",
        "circular SAP inclusions in homogeneous cladding",
        "linear superposition of two far-field inclusion kernels",
        "K_i is undefined and omitted from each inclusion contribution",
    )
    limitations: tuple[str, ...] = (
        "outputs are normalized qualitative kernels without calibrated stress values",
        "the finite cladding boundary is not solved",
        "SAP interiors and configured interface regions are excluded",
        "elastic and photoelastic material coefficients do not enter this kernel",
    )
    validity: PandaFieldMapValidity


class PandaFieldMapResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    configuration: PandaFieldMapRequest
    x_coordinates_m: tuple[_FiniteFloat, ...]
    y_coordinates_m: tuple[_FiniteFloat, ...]
    validity_mask: tuple[tuple[bool, ...], ...]
    normalized_deviatoric_difference_kernel: tuple[tuple[_OptionalFiniteFloat, ...], ...]
    normalized_shear_kernel: tuple[tuple[_OptionalFiniteFloat, ...], ...]
    normalized_principal_difference_kernel: tuple[tuple[_OptionalFiniteFloat, ...], ...]
    principal_axis_angle_rad: tuple[tuple[_OptionalFiniteFloat, ...], ...]
    sap_thermal_mismatch_strains: tuple[_FiniteFloat, _FiniteFloat]
    kernel_scale: _PositiveFiniteFloat
    warnings: tuple[PandaFieldMapWarning, ...]
    model_manifest: PandaFieldMapManifest

    @model_validator(mode="after")
    def validate_grid_contract(self) -> Self:
        expected_size = self.configuration.sampling.grid_points
        if len(self.x_coordinates_m) != expected_size or len(self.y_coordinates_m) != expected_size:
            raise PydanticCustomError(
                "field_map_coordinate_length_mismatch",
                "Coordinate lengths must match the configured grid size.",
            )

        grids = (
            self.validity_mask,
            self.normalized_deviatoric_difference_kernel,
            self.normalized_shear_kernel,
            self.normalized_principal_difference_kernel,
            self.principal_axis_angle_rad,
        )
        if any(len(grid) != expected_size for grid in grids):
            raise PydanticCustomError(
                "field_map_row_count_mismatch",
                "Every field-map grid must have one row per y coordinate.",
            )
        if any(len(row) != expected_size for grid in grids for row in grid):
            raise PydanticCustomError(
                "field_map_column_count_mismatch",
                "Every field-map row must have one cell per x coordinate.",
            )

        valid_point_count = 0
        for row_index in range(expected_size):
            for column_index in range(expected_size):
                valid = self.validity_mask[row_index][column_index]
                deviatoric = self.normalized_deviatoric_difference_kernel[row_index][column_index]
                shear = self.normalized_shear_kernel[row_index][column_index]
                principal = self.normalized_principal_difference_kernel[row_index][column_index]
                angle = self.principal_axis_angle_rad[row_index][column_index]
                values = (deviatoric, shear, principal, angle)

                if not valid:
                    if any(value is not None for value in values):
                        raise PydanticCustomError(
                            "invalid_field_map_cell_has_value",
                            "Invalid field-map cells must contain only None values.",
                        )
                    continue

                valid_point_count += 1
                if deviatoric is None or shear is None or principal is None:
                    raise PydanticCustomError(
                        "valid_field_map_cell_missing_value",
                        "Valid field-map cells require all normalized kernel values.",
                    )
                if not all(math.isfinite(value) for value in (deviatoric, shear, principal)):
                    raise PydanticCustomError(
                        "field_map_cell_not_finite",
                        "Valid field-map cells must contain finite numeric values.",
                    )
                if not (
                    -1.0 - _NORMALIZED_TOLERANCE <= deviatoric <= 1.0 + _NORMALIZED_TOLERANCE
                    and -1.0 - _NORMALIZED_TOLERANCE <= shear <= 1.0 + _NORMALIZED_TOLERANCE
                    and -_NORMALIZED_TOLERANCE <= principal <= 1.0 + _NORMALIZED_TOLERANCE
                ):
                    raise PydanticCustomError(
                        "normalized_field_map_cell_out_of_range",
                        "Normalized field-map cells are outside their allowed ranges.",
                    )
                if principal <= _NORMALIZED_TOLERANCE:
                    if angle is not None:
                        raise PydanticCustomError(
                            "zero_principal_cell_has_axis",
                            "Numerically zero principal differences must not define an axis.",
                        )
                elif angle is None or not math.isfinite(angle):
                    raise PydanticCustomError(
                        "principal_axis_invalid",
                        "Nonzero principal differences require a finite principal-axis angle.",
                    )

        validity = self.model_manifest.validity
        if valid_point_count != validity.valid_point_count:
            raise PydanticCustomError(
                "valid_point_count_mismatch",
                "Manifest valid-point count must match the validity mask.",
            )
        if validity.interface_buffer_m != self.configuration.sampling.interface_buffer_m:
            raise PydanticCustomError(
                "interface_buffer_mismatch",
                "Manifest interface buffer must match the configured sampling buffer.",
            )
        if not math.isfinite(self.kernel_scale) or self.kernel_scale <= 0.0:
            raise PydanticCustomError(
                "kernel_scale_invalid",
                "Kernel scale must be finite and greater than zero.",
            )
        return self


__all__ = [
    "PandaFieldMapManifest",
    "PandaFieldMapResult",
    "PandaFieldMapValidity",
    "PandaFieldMapWarning",
    "PandaFieldMapWarningCode",
]
