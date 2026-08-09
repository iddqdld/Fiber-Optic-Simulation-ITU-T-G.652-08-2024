from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from .request import DEFAULT_GRID_POINTS, MAX_GRID_POINTS, MIN_GRID_POINTS
from .scalar_lp_step_index import MAX_SCALAR_LP_MODE_FAMILIES

_PositiveFiniteFloat = Annotated[float, Field(strict=True, gt=0, allow_inf_nan=False)]
_AngularOrder = Annotated[int, Field(strict=True, ge=0, le=64)]
_RadialOrder = Annotated[int, Field(strict=True, ge=1, le=64)]
_GridPoints = Annotated[
    int,
    Field(strict=True, ge=MIN_GRID_POINTS, le=MAX_GRID_POINTS),
]


class ScalarLPModeCatalogRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    wavelength_m: _PositiveFiniteFloat
    core_radius_m: _PositiveFiniteFloat
    n_core: _PositiveFiniteFloat
    n_cladding: _PositiveFiniteFloat
    max_mode_families: Annotated[
        int,
        Field(strict=True, ge=1, le=MAX_SCALAR_LP_MODE_FAMILIES),
    ] = MAX_SCALAR_LP_MODE_FAMILIES

    @model_validator(mode="after")
    def validate_index_order(self) -> Self:
        if self.n_core <= self.n_cladding:
            raise PydanticCustomError(
                "invalid_refractive_index_order",
                "Core refractive index must be greater than cladding refractive index.",
            )
        return self


class ScalarLPModeFieldRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    wavelength_m: _PositiveFiniteFloat
    core_radius_m: _PositiveFiniteFloat
    n_core: _PositiveFiniteFloat
    n_cladding: _PositiveFiniteFloat
    azimuthal_order: _AngularOrder
    radial_order: _RadialOrder
    grid_half_width_m: _PositiveFiniteFloat
    grid_points: _GridPoints = DEFAULT_GRID_POINTS

    @model_validator(mode="after")
    def validate_field_request(self) -> Self:
        if self.n_core <= self.n_cladding:
            raise PydanticCustomError(
                "invalid_refractive_index_order",
                "Core refractive index must be greater than cladding refractive index.",
            )
        if self.grid_points % 2 == 0:
            raise PydanticCustomError(
                "grid_points_must_be_odd",
                "Grid points must be odd so the sampling grid contains the origin.",
            )
        return self
