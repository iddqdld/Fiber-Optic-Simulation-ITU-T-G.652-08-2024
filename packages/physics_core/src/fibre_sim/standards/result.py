from enum import StrEnum
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from .constants import (
    G652D_LINEAR_MAX_INTERCEPT_PS_PER_NM_KM,
    G652D_LINEAR_MAX_SLOPE_PS_PER_NM2_KM,
    G652D_LINEAR_MIN_INTERCEPT_PS_PER_NM_KM,
    G652D_LINEAR_MIN_SLOPE_PS_PER_NM2_KM,
    G652D_MAX_WAVELENGTH_NM,
    G652D_MIN_WAVELENGTH_NM,
    G652D_TRANSITION_WAVELENGTH_NM,
    G652D_ZERO_DISPERSION_MAX_SLOPE_PS_PER_NM2_KM,
    G652D_ZERO_DISPERSION_MAX_WAVELENGTH_NM,
    G652D_ZERO_DISPERSION_MIN_SLOPE_PS_PER_NM2_KM,
    G652D_ZERO_DISPERSION_MIN_WAVELENGTH_NM,
)


class G652DDispersionFitRegion(StrEnum):
    THREE_TERM_SELLMEIER = "three_term_sellmeier"
    LINEAR = "linear"


class G652DDispersionEnvelopeManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["itu_t_g652d_chromatic_dispersion_envelope"] = (
        "itu_t_g652d_chromatic_dispersion_envelope"
    )
    model_version: Literal["1.0.0"] = "1.0.0"
    standard_name: Literal["ITU-T G.652"] = "ITU-T G.652"
    standard_edition: Literal["08/2024"] = "08/2024"
    fibre_category: Literal["G.652.D"] = "G.652.D"
    boundary_equations: tuple[str, ...] = ("6-2a", "6-2b", "6-2c", "6-3")
    wavelength_min_nm: float = Field(default=G652D_MIN_WAVELENGTH_NM, allow_inf_nan=False)
    wavelength_transition_nm: float = Field(
        default=G652D_TRANSITION_WAVELENGTH_NM, allow_inf_nan=False
    )
    wavelength_max_nm: float = Field(default=G652D_MAX_WAVELENGTH_NM, allow_inf_nan=False)
    zero_dispersion_wavelength_min_nm: float = Field(
        default=G652D_ZERO_DISPERSION_MIN_WAVELENGTH_NM, allow_inf_nan=False
    )
    zero_dispersion_wavelength_max_nm: float = Field(
        default=G652D_ZERO_DISPERSION_MAX_WAVELENGTH_NM, allow_inf_nan=False
    )
    zero_dispersion_slope_min_ps_per_nm2_km: float = Field(
        default=G652D_ZERO_DISPERSION_MIN_SLOPE_PS_PER_NM2_KM, allow_inf_nan=False
    )
    zero_dispersion_slope_max_ps_per_nm2_km: float = Field(
        default=G652D_ZERO_DISPERSION_MAX_SLOPE_PS_PER_NM2_KM, allow_inf_nan=False
    )
    linear_minimum_intercept_ps_per_nm_km: float = Field(
        default=G652D_LINEAR_MIN_INTERCEPT_PS_PER_NM_KM, allow_inf_nan=False
    )
    linear_minimum_slope_ps_per_nm2_km: float = Field(
        default=G652D_LINEAR_MIN_SLOPE_PS_PER_NM2_KM, allow_inf_nan=False
    )
    linear_maximum_intercept_ps_per_nm_km: float = Field(
        default=G652D_LINEAR_MAX_INTERCEPT_PS_PER_NM_KM, allow_inf_nan=False
    )
    linear_maximum_slope_ps_per_nm2_km: float = Field(
        default=G652D_LINEAR_MAX_SLOPE_PS_PER_NM2_KM, allow_inf_nan=False
    )
    assumptions: tuple[str, ...] = (
        "normative chromatic-dispersion coefficient boundaries for G.652.D fibre attributes",
        "1260-1460 nm uses the published three-term Sellmeier boundary form",
        "1460-1625 nm uses the published linear boundary form",
        "the linear region owns the shared 1460 nm boundary for deterministic evaluation",
    )
    limitations: tuple[str, ...] = (
        "envelope bounds are not a nominal or measured product dispersion curve",
        "dispersion-envelope evaluation alone is not complete G.652.D conformance",
        "excludes longitudinal variation, statistical link design, and multi-section accumulation",
        "does not calculate pulse broadening or group delay",
    )


class G652DDispersionEnvelopeResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    wavelength_nm: float = Field(
        ge=G652D_MIN_WAVELENGTH_NM,
        le=G652D_MAX_WAVELENGTH_NM,
        allow_inf_nan=False,
    )
    fit_region: G652DDispersionFitRegion
    minimum_dispersion_ps_per_nm_km: float = Field(allow_inf_nan=False)
    maximum_dispersion_ps_per_nm_km: float = Field(allow_inf_nan=False)
    model_manifest: G652DDispersionEnvelopeManifest

    @model_validator(mode="after")
    def validate_dispersion_bounds(self) -> Self:
        if self.minimum_dispersion_ps_per_nm_km > self.maximum_dispersion_ps_per_nm_km:
            raise PydanticCustomError(
                "dispersion_envelope_bounds_reversed",
                "G.652.D minimum dispersion cannot exceed maximum dispersion.",
            )
        return self
