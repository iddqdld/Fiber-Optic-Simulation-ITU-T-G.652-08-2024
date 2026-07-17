from pydantic import BaseModel, ConfigDict, Field


class ConstantAttenuationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    length_km: float = Field(
        ge=0,
        allow_inf_nan=False,
        description="Fibre-section length in kilometres (km).",
    )
    attenuation_db_per_km: float = Field(
        ge=0,
        allow_inf_nan=False,
        description="Uniform attenuation coefficient in decibels per kilometre (dB/km).",
    )
    input_power_dbm: float = Field(
        allow_inf_nan=False,
        description="Input optical power level in decibels referenced to one milliwatt (dBm).",
    )
