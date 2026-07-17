from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError


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
    model_manifest: ConstantAttenuationManifest

    @model_validator(mode="after")
    def validate_passive_output_power(self) -> Self:
        if self.output_power_dbm > self.input_power_dbm:
            raise PydanticCustomError(
                "passive_output_power_exceeds_input",
                "Passive attenuation output power cannot exceed input power.",
            )
        return self
