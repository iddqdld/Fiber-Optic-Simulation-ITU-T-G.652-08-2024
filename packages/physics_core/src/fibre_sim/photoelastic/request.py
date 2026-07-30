from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from .geometry import PandaGeometry
from .loads import ThermalState
from .materials import PandaMaterialSet

MIN_FIELD_MAP_GRID_POINTS = 3
MAX_FIELD_MAP_GRID_POINTS = 65
DEFAULT_FIELD_MAP_GRID_POINTS = 65

_PositiveStrictFiniteFloat = Annotated[
    float,
    Field(strict=True, gt=0, allow_inf_nan=False),
]
_NonNegativeStrictFiniteFloat = Annotated[
    float,
    Field(strict=True, ge=0, allow_inf_nan=False),
]
_StrictGridPoints = Annotated[
    int,
    Field(
        strict=True,
        ge=MIN_FIELD_MAP_GRID_POINTS,
        le=MAX_FIELD_MAP_GRID_POINTS,
    ),
]


class FieldMapSamplingConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    grid_half_width_m: _PositiveStrictFiniteFloat
    grid_points: _StrictGridPoints = DEFAULT_FIELD_MAP_GRID_POINTS
    interface_buffer_m: _NonNegativeStrictFiniteFloat = 0.0

    @model_validator(mode="after")
    def validate_grid_points_are_odd(self) -> Self:
        if self.grid_points % 2 == 0:
            raise PydanticCustomError(
                "grid_points_must_be_odd",
                "Grid points must be odd so the sampling grid contains the origin.",
            )
        return self


class PandaFieldMapRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    geometry: PandaGeometry
    materials: PandaMaterialSet
    thermal: ThermalState
    wavelength_m: _PositiveStrictFiniteFloat
    sampling: FieldMapSamplingConfig

    @model_validator(mode="after")
    def validate_sampling_covers_cladding(self) -> Self:
        if self.sampling.grid_half_width_m < self.geometry.cladding_radius_m:
            raise PydanticCustomError(
                "sampling_grid_does_not_cover_cladding",
                "Sampling grid half-width must cover the cladding radius.",
            )
        return self


__all__ = [
    "DEFAULT_FIELD_MAP_GRID_POINTS",
    "FieldMapSamplingConfig",
    "MAX_FIELD_MAP_GRID_POINTS",
    "MIN_FIELD_MAP_GRID_POINTS",
    "PandaFieldMapRequest",
]
