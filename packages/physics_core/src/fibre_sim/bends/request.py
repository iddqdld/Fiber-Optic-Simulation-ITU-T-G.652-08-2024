from enum import StrEnum
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from .constants import MAX_MACROBENDS

_PositionFraction = Annotated[
    float,
    Field(strict=True, ge=0, le=1, allow_inf_nan=False),
]
_PositiveFiniteFloat = Annotated[
    float,
    Field(strict=True, gt=0, allow_inf_nan=False),
]
_StrictFiniteFloat = Annotated[float, Field(strict=True, allow_inf_nan=False)]


class BendDirection(StrEnum):
    LEFT = "left"
    RIGHT = "right"


class MacrobendInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    position_fraction: _PositionFraction = Field(
        description="Macrobend position as a dimensionless fraction of propagation distance."
    )
    radius_mm: _PositiveFiniteFloat = Field(
        description="Physical macrobend radius in millimetres (mm)."
    )
    angle_deg: Annotated[
        float,
        Field(strict=True, gt=0, le=360, allow_inf_nan=False),
    ] = Field(description="Constant-curvature macrobend angle in degrees (deg).")
    direction: BendDirection = Field(
        default=BendDirection.LEFT,
        description="Planar turn direction viewed from above the transverse y axis.",
    )


class MarcuseBendLossInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    wavelength_m: _PositiveFiniteFloat
    core_radius_m: _PositiveFiniteFloat
    cladding_radius_m: _PositiveFiniteFloat | None = None
    n_core: _PositiveFiniteFloat
    n_cladding: _PositiveFiniteFloat
    beta_per_m: _PositiveFiniteFloat
    bend_radius_m: _PositiveFiniteFloat

    @model_validator(mode="after")
    def validate_geometry_and_guided_mode(self) -> Self:
        if self.cladding_radius_m is not None and self.core_radius_m >= self.cladding_radius_m:
            raise PydanticCustomError(
                "invalid_fibre_radius_order",
                "Core radius must be less than cladding radius.",
            )
        if self.n_core <= self.n_cladding:
            raise PydanticCustomError(
                "invalid_refractive_index_order",
                "Core refractive index must be greater than cladding refractive index.",
            )
        k0_per_m = 2.0 * 3.141592653589793 / self.wavelength_m
        if not self.n_cladding * k0_per_m < self.beta_per_m < self.n_core * k0_per_m:
            raise PydanticCustomError(
                "beta_outside_guided_mode_bounds",
                "Propagation constant must be between the cladding and core guided-mode bounds.",
            )
        return self


class MacrobendLossRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    wavelength_m: _PositiveFiniteFloat
    core_radius_m: _PositiveFiniteFloat
    cladding_radius_m: _PositiveFiniteFloat | None = None
    n_core: _PositiveFiniteFloat
    n_cladding: _PositiveFiniteFloat
    input_power_dbm: _StrictFiniteFloat
    beta_per_m: _PositiveFiniteFloat | None = None
    bends: tuple[MacrobendInput, ...] = Field(
        default=(),
        max_length=MAX_MACROBENDS,
        description="Constant-curvature macrobends in propagation order.",
    )

    @model_validator(mode="after")
    def validate_request(self) -> Self:
        if self.cladding_radius_m is not None and self.core_radius_m >= self.cladding_radius_m:
            raise PydanticCustomError(
                "invalid_fibre_radius_order",
                "Core radius must be less than cladding radius.",
            )
        if self.n_core <= self.n_cladding:
            raise PydanticCustomError(
                "invalid_refractive_index_order",
                "Core refractive index must be greater than cladding refractive index.",
            )
        positions = tuple(bend.position_fraction for bend in self.bends)
        if any(
            current >= following
            for current, following in zip(positions, positions[1:], strict=False)
        ):
            raise PydanticCustomError(
                "bend_positions_not_strictly_increasing",
                "Macrobend positions must be strictly increasing in propagation order.",
            )
        if self.beta_per_m is not None:
            k0_per_m = 2.0 * 3.141592653589793 / self.wavelength_m
            if not self.n_cladding * k0_per_m < self.beta_per_m < self.n_core * k0_per_m:
                raise PydanticCustomError(
                    "beta_outside_guided_mode_bounds",
                    "Propagation constant must be between the cladding and core "
                    "guided-mode bounds.",
                )
        return self
