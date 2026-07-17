from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from .constants import VACUUM_SPEED_M_PER_S


class ChromaticPulseBroadeningManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["first_order_chromatic_pulse_broadening"] = (
        "first_order_chromatic_pulse_broadening"
    )
    model_version: Literal["1.0.0"] = "1.0.0"
    width_convention: Literal["fwhm"] = "fwhm"
    assumptions: tuple[str, ...] = (
        "constant supplied chromatic-dispersion coefficient over the fibre section",
        "Gaussian input pulse and Gaussian source spectrum use FWHM widths",
        "independent Gaussian broadening contributions combine in quadrature",
        "pulse-width broadening uses the magnitude of chromatic dispersion",
    )
    limitations: tuple[str, ...] = (
        "first-order delay-spread approximation rather than full pulse propagation",
        "dispersion sign is retained for accumulated dispersion but not pulse-width magnitude",
        "excludes initial chirp, higher-order dispersion, nonlinearity, and "
        "polarization-mode dispersion",
        "not a G.652 dispersion fit or conformance model",
    )


class GroupDelayManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["constant_group_index_delay"] = "constant_group_index_delay"
    model_version: Literal["1.0.0"] = "1.0.0"
    vacuum_speed_m_per_s: float = Field(
        default=VACUUM_SPEED_M_PER_S,
        gt=0,
        allow_inf_nan=False,
    )
    assumptions: tuple[str, ...] = (
        "constant supplied group index over the fibre section",
        "deterministic propagation delay for the supplied section",
        "vacuum speed of light is exact at 299792458 m/s",
    )
    limitations: tuple[str, ...] = (
        "group index is supplied rather than derived from wavelength-dependent effective index",
        "excludes chromatic pulse broadening and polarization-mode dispersion",
        "propagation group delay is distinct from differential group delay",
        "not a G.652 group-delay fit or conformance model",
    )


class ChromaticPulseBroadeningResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    length_km: float = Field(ge=0, allow_inf_nan=False)
    dispersion_ps_per_nm_km: float = Field(allow_inf_nan=False)
    spectral_width_fwhm_nm: float = Field(ge=0, allow_inf_nan=False)
    input_pulse_fwhm_ps: float = Field(gt=0, allow_inf_nan=False)
    accumulated_dispersion_ps_per_nm: float = Field(allow_inf_nan=False)
    dispersion_broadening_fwhm_ps: float = Field(ge=0, allow_inf_nan=False)
    output_pulse_fwhm_ps: float = Field(gt=0, allow_inf_nan=False)
    model_manifest: ChromaticPulseBroadeningManifest

    @model_validator(mode="after")
    def validate_output_pulse_width(self) -> Self:
        if self.output_pulse_fwhm_ps < self.input_pulse_fwhm_ps:
            raise PydanticCustomError(
                "output_pulse_narrower_than_input",
                "First-order chromatic broadening cannot reduce pulse FWHM.",
            )
        return self


class GroupDelayResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    length_km: float = Field(ge=0, allow_inf_nan=False)
    group_index_dimensionless: float = Field(gt=0, allow_inf_nan=False)
    group_delay_ps: float = Field(ge=0, allow_inf_nan=False)
    model_manifest: GroupDelayManifest
