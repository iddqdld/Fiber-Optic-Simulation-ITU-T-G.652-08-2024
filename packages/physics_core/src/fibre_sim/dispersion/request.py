from pydantic import BaseModel, ConfigDict, Field


class ChromaticPulseBroadeningRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    length_km: float = Field(
        ge=0,
        allow_inf_nan=False,
        description="Fibre-section length in kilometres.",
    )
    dispersion_ps_per_nm_km: float = Field(
        allow_inf_nan=False,
        description="Signed supplied chromatic-dispersion coefficient in ps/(nm·km).",
    )
    spectral_width_fwhm_nm: float = Field(
        ge=0,
        allow_inf_nan=False,
        description="Source spectral FWHM in nm.",
    )
    input_pulse_fwhm_ps: float = Field(
        gt=0,
        allow_inf_nan=False,
        description="Input pulse FWHM in ps.",
    )


class GroupDelayRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    length_km: float = Field(
        ge=0,
        allow_inf_nan=False,
        description="Fibre-section length in kilometres (km).",
    )
    group_index_dimensionless: float = Field(
        gt=0,
        allow_inf_nan=False,
        description="Supplied dimensionless group index.",
    )
