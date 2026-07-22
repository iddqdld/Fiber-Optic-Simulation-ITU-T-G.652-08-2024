import math
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from .constants import MAX_MACROBENDS

_PositionFraction = Annotated[float, Field(strict=True, ge=0, le=1, allow_inf_nan=False)]
_PositiveFiniteFloat = Annotated[float, Field(strict=True, gt=0, allow_inf_nan=False)]
_NonNegativeFiniteFloat = Annotated[float, Field(strict=True, ge=0, allow_inf_nan=False)]
_StrictFiniteFloat = Annotated[float, Field(strict=True, allow_inf_nan=False)]


class MacrobendLossPoint(BaseModel):
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
    cumulative_bend_loss_db: _NonNegativeFiniteFloat = Field(
        description="Cumulative macrobend loss through this point in decibels (dB)."
    )
    output_power_dbm: _StrictFiniteFloat = Field(
        description=(
            "Output optical power level at this point in decibels referenced to one "
            "milliwatt (dBm)."
        )
    )


class MacrobendLossManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["user_supplied_macrobend_loss"] = "user_supplied_macrobend_loss"
    model_version: Literal["1.0.0"] = "1.0.0"
    loss_source: Literal["user_supplied"] = "user_supplied"
    aggregation: Literal["additive_db"] = "additive_db"
    assumptions: tuple[str, ...] = (
        "each bend loss is user supplied and passive",
        "bends are ordered in the provided propagation order",
        "losses are additive in dB",
    )
    limitations: tuple[str, ...] = (
        "geometry and metadata do not affect or alter supplied loss; radius, angle, and "
        "position do not derive loss",
        "no wavelength/MFD/index/radiation model is included",
        "this is not the G.652 qualification test or conformance",
    )


class MacrobendLossResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    input_power_dbm: _StrictFiniteFloat
    total_bend_loss_db: _NonNegativeFiniteFloat
    output_power_dbm: _StrictFiniteFloat
    bends: tuple[MacrobendLossPoint, ...] = Field(max_length=MAX_MACROBENDS)
    model_manifest: MacrobendLossManifest

    @model_validator(mode="after")
    def validate_passive_output_power(self) -> Self:
        if self.output_power_dbm > self.input_power_dbm:
            raise PydanticCustomError(
                "passive_output_power_exceeds_input",
                "Passive macrobend output power cannot exceed input power.",
            )
        return self

    @model_validator(mode="after")
    def validate_point_positions(self) -> Self:
        if any(
            current.position_fraction >= following.position_fraction
            for current, following in zip(self.bends, self.bends[1:], strict=False)
        ):
            raise PydanticCustomError(
                "result_bend_positions_not_strictly_increasing",
                "Macrobend result positions must be strictly increasing in propagation order.",
            )
        return self

    @model_validator(mode="after")
    def validate_point_monotonicity(self) -> Self:
        if any(point.output_power_dbm > self.input_power_dbm for point in self.bends):
            raise PydanticCustomError(
                "point_power_exceeds_input",
                "Macrobend point output power cannot exceed result input power.",
            )
        if any(
            previous.cumulative_bend_loss_db > current.cumulative_bend_loss_db
            for previous, current in zip(self.bends, self.bends[1:], strict=False)
        ):
            raise PydanticCustomError(
                "cumulative_bend_loss_decreases",
                "Cumulative macrobend loss must be non-decreasing in propagation order.",
            )
        if any(
            previous.output_power_dbm < current.output_power_dbm
            for previous, current in zip(self.bends, self.bends[1:], strict=False)
        ):
            raise PydanticCustomError(
                "point_power_increases",
                "Macrobend point output power must be non-increasing in propagation order.",
            )
        return self

    @model_validator(mode="after")
    def validate_aggregate_shape(self) -> Self:
        if not self.bends:
            if self.total_bend_loss_db != 0.0 or math.copysign(1.0, self.total_bend_loss_db) < 0:
                raise PydanticCustomError(
                    "empty_result_total_loss_not_positive_zero",
                    "Empty macrobend results require total bend loss to be positive 0.0.",
                )
            if self.output_power_dbm != self.input_power_dbm:
                raise PydanticCustomError(
                    "empty_result_output_power_mismatch",
                    "Empty macrobend results require output power to equal input power.",
                )
            return self

        last_point = self.bends[-1]
        if last_point.cumulative_bend_loss_db != self.total_bend_loss_db:
            raise PydanticCustomError(
                "last_bend_total_loss_mismatch",
                "The last macrobend cumulative loss must match total bend loss.",
            )
        if last_point.output_power_dbm != self.output_power_dbm:
            raise PydanticCustomError(
                "last_bend_output_power_mismatch",
                "The last macrobend output power must match result output power.",
            )
        return self
