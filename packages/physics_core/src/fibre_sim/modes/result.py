from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from .request import MAX_GRID_POINTS, MIN_GRID_POINTS

_PositiveFiniteFloat = Annotated[float, Field(gt=0, allow_inf_nan=False)]
_FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]
_GridPoints = Annotated[
    int,
    Field(strict=True, ge=MIN_GRID_POINTS, le=MAX_GRID_POINTS),
]
_ProfileValue = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]


class GaussianModeProfileManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["gaussian_lp01_mode_profile"] = "gaussian_lp01_mode_profile"
    model_version: Literal["1.0.0"] = "1.0.0"
    radius_convention: Literal["1/e_field_radius"] = "1/e_field_radius"
    normalization_convention: Literal["unit_peak_field_and_intensity"] = (
        "unit_peak_field_and_intensity"
    )
    assumptions: tuple[str, ...] = (
        "scalar, circularly symmetric Gaussian LP01 approximation",
        "F/F0=exp(-r^2/w^2)",
    )
    limitations: tuple[str, ...] = (
        "not an exact step-index eigenmode solver",
        "mode_field_radius_um must come from a supplied/independently calculated value "
        "rather than being inferred by this contract",
    )


class GaussianModeProfileResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    mode_field_radius_um: _PositiveFiniteFloat
    grid_half_width_um: _PositiveFiniteFloat
    grid_points: _GridPoints
    x_um: tuple[_FiniteFloat, ...]
    y_um: tuple[_FiniteFloat, ...]
    normalized_field: tuple[tuple[_ProfileValue, ...], ...]
    normalized_intensity: tuple[tuple[_ProfileValue, ...], ...]
    model_manifest: GaussianModeProfileManifest

    @model_validator(mode="after")
    def validate_grid_points_are_odd(self) -> Self:
        if self.grid_points % 2 == 0:
            raise PydanticCustomError(
                "grid_points_must_be_odd",
                "Grid points must be odd so the sampling grid contains the origin.",
            )
        return self

    @model_validator(mode="after")
    def validate_profile_axis_lengths(self) -> Self:
        if len(self.x_um) != self.grid_points or len(self.y_um) != self.grid_points:
            raise PydanticCustomError(
                "profile_axis_length_mismatch",
                "Profile axes must each contain exactly grid_points values.",
            )
        return self

    @model_validator(mode="after")
    def validate_profile_grid_shapes(self) -> Self:
        for profile in (self.normalized_field, self.normalized_intensity):
            if len(profile) != self.grid_points or any(
                len(row) != self.grid_points for row in profile
            ):
                raise PydanticCustomError(
                    "profile_grid_shape_mismatch",
                    "Profile grids must contain exactly grid_points rows and columns.",
                )
        return self
