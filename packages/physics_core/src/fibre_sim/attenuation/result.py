from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]


class ConstantAttenuationManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["constant_fibre_attenuation"] = "constant_fibre_attenuation"
    model_version: Literal["1.0.0"] = "1.0.0"
    assumptions: tuple[str, ...] = (
        "uniform attenuation coefficient over the fibre section",
        "passive fibre loss only",
        "attenuation is additive in dB",
    )
    limitations: tuple[str, ...] = (
        "attenuation coefficient is supplied rather than inferred from wavelength or material",
        "excludes splice, connector, bend, and engineering-margin losses",
        "not a G.652 conformance or typical-value model",
    )


class ConstantAttenuationResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    length_km: float = Field(ge=0, allow_inf_nan=False)
    attenuation_db_per_km: float = Field(ge=0, allow_inf_nan=False)
    input_power_dbm: float = Field(allow_inf_nan=False)
    section_loss_db: float = Field(ge=0, allow_inf_nan=False)
    output_power_dbm: float = Field(allow_inf_nan=False)
    distance_samples_km: tuple[FiniteFloat, ...] = Field(min_length=1, max_length=65)
    power_samples_dbm: tuple[FiniteFloat, ...] = Field(min_length=1, max_length=65)
    model_manifest: ConstantAttenuationManifest

    @model_validator(mode="after")
    def validate_passive_output_power(self) -> Self:
        if self.output_power_dbm > self.input_power_dbm:
            raise PydanticCustomError(
                "passive_output_power_exceeds_input",
                "Passive attenuation output power cannot exceed input power.",
            )
        return self

    @model_validator(mode="after")
    def validate_power_samples(self) -> Self:
        if len(self.distance_samples_km) != len(self.power_samples_dbm):
            raise PydanticCustomError(
                "sample_series_length_mismatch",
                "Distance and power sample series must have equal lengths.",
            )

        if any(value < 0.0 or value > self.length_km for value in self.distance_samples_km):
            raise PydanticCustomError(
                "sample_distance_out_of_bounds",
                "Distance samples must be within the fibre-section bounds.",
            )

        if self.length_km == 0.0:
            if self.distance_samples_km != (0.0,) or self.power_samples_dbm != (
                self.input_power_dbm,
            ):
                raise PydanticCustomError(
                    "zero_length_sample_series_invalid",
                    "Zero-length attenuation results require one zero-distance input-power sample.",
                )
        else:
            if self.distance_samples_km[0] != 0.0:
                raise PydanticCustomError(
                    "sample_distance_start_mismatch",
                    "Distance samples must start at zero.",
                )
            if self.distance_samples_km[-1] != self.length_km:
                raise PydanticCustomError(
                    "sample_distance_end_mismatch",
                    "Distance samples must end at the section length.",
                )
            if any(
                previous >= current
                for previous, current in zip(
                    self.distance_samples_km, self.distance_samples_km[1:], strict=False
                )
            ):
                raise PydanticCustomError(
                    "sample_distances_not_strictly_increasing",
                    "Positive-length distance samples must be strictly increasing.",
                )

        if self.power_samples_dbm[0] != self.input_power_dbm:
            raise PydanticCustomError(
                "sample_power_start_mismatch",
                "Power samples must start at input power.",
            )
        if self.power_samples_dbm[-1] != self.output_power_dbm:
            raise PydanticCustomError(
                "sample_power_end_mismatch",
                "Power samples must end at output power.",
            )
        if any(
            previous < current
            for previous, current in zip(
                self.power_samples_dbm, self.power_samples_dbm[1:], strict=False
            )
        ):
            raise PydanticCustomError(
                "sample_power_increases",
                "Power samples must be non-increasing.",
            )
        return self
