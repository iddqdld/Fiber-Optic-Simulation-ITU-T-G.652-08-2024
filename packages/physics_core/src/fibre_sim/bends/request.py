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
_NonNegativeFiniteFloat = Annotated[
    float,
    Field(strict=True, ge=0, allow_inf_nan=False),
]
_StrictFiniteFloat = Annotated[float, Field(strict=True, allow_inf_nan=False)]


class MacrobendInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    position_fraction: _PositionFraction = Field(
        description="Macrobend position as a dimensionless fraction of propagation distance."
    )
    radius_mm: _PositiveFiniteFloat = Field(
        description="Macrobend bend radius in millimetres (mm)."
    )
    angle_deg: Annotated[
        float,
        Field(strict=True, gt=0, le=360, allow_inf_nan=False),
    ] = Field(description="Macrobend angle in degrees (deg).")
    supplied_loss_db: _NonNegativeFiniteFloat = Field(
        description="User-supplied macrobend loss in decibels (dB)."
    )


class MacrobendLossRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    input_power_dbm: _StrictFiniteFloat = Field(
        description="Input optical power level in decibels referenced to one milliwatt (dBm)."
    )
    bends: tuple[MacrobendInput, ...] = Field(
        default=(),
        max_length=MAX_MACROBENDS,
        description="Macrobends in propagation order, with at most 32 entries.",
    )

    @model_validator(mode="after")
    def validate_bend_positions(self) -> Self:
        positions = tuple(bend.position_fraction for bend in self.bends)
        if any(
            current >= following
            for current, following in zip(
                positions,
                positions[1:],
                strict=False,
            )
        ):
            raise PydanticCustomError(
                "bend_positions_not_strictly_increasing",
                "Macrobend positions must be strictly increasing in propagation order.",
            )
        return self
