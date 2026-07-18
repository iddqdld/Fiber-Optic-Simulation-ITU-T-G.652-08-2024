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


class G652DAttenuationApplication(StrEnum):
    STANDARD_CABLE = "standard_cable"
    SHORT_JUMPER = "short_jumper"
    INDOOR_CABLE = "indoor_cable"
    DROP_CABLE = "drop_cable"


class G652DAttenuationLimitBand(StrEnum):
    GENERAL_1310_1625 = "general_1310_1625"
    C_BAND_1530_1565 = "c_band_1530_1565"


class G652DAttenuationCheckStatus(StrEnum):
    PASS = "pass"
    FAIL_ABOVE_MAXIMUM = "fail_above_maximum"
    NOT_APPLICABLE = "not_applicable"


class G652DAttenuationCheckManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["itu_t_g652d_attenuation_check"] = "itu_t_g652d_attenuation_check"
    model_version: Literal["1.0.0"] = "1.0.0"
    standard_name: Literal["ITU-T G.652"] = "ITU-T G.652"
    standard_edition: Literal["08/2024"] = "08/2024"
    fibre_category: Literal["G.652.D"] = "G.652.D"
    comparison_rule: Literal["inclusive_maximum"] = "inclusive_maximum"
    assumptions: tuple[str, ...] = (
        "the supplied value is a cable attenuation coefficient measured at the same "
        "wavelength being checked",
        "the C-band limit overrides the general 1310-1625 nm cable limit for "
        "1530-1565 nm inclusively",
    )
    limitations: tuple[str, ...] = (
        "the direct check does not infer a 1260-1310 nm value from the +0.07 dB/km "
        "extension note; a measured 1310 nm value is required",
        "hydrogen ageing is a type test and is not inferred from the supplied attenuation value",
        "short jumpers, indoor cables, and drop cables are excluded from the represented "
        "standard-cable context",
        "a passing attenuation result is not full G.652.D conformance",
    )


class G652DAttenuationCheckResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    wavelength_nm: float = Field(
        strict=True,
        ge=G652D_MIN_WAVELENGTH_NM,
        le=G652D_MAX_WAVELENGTH_NM,
        allow_inf_nan=False,
    )
    supplied_attenuation_db_per_km: float = Field(
        strict=True,
        ge=0,
        allow_inf_nan=False,
    )
    cable_application: G652DAttenuationApplication
    limit_band: G652DAttenuationLimitBand | None = None
    maximum_attenuation_db_per_km: float | None = Field(
        default=None,
        strict=True,
        ge=0,
        allow_inf_nan=False,
    )
    margin_below_maximum_db_per_km: float | None = Field(
        default=None,
        strict=True,
        allow_inf_nan=False,
    )
    status: G652DAttenuationCheckStatus
    not_applicable_reason: str | None = None
    model_manifest: G652DAttenuationCheckManifest

    @model_validator(mode="after")
    def validate_attenuation_check_shape(self) -> Self:
        comparison_values = (
            self.limit_band,
            self.maximum_attenuation_db_per_km,
            self.margin_below_maximum_db_per_km,
        )
        if self.status is G652DAttenuationCheckStatus.NOT_APPLICABLE:
            if any(value is not None for value in comparison_values):
                raise PydanticCustomError(
                    "attenuation_not_applicable_comparison_fields_forbidden",
                    "G.652.D not-applicable attenuation results must omit limit band, "
                    "maximum, and margin.",
                )
            if self.not_applicable_reason is None or not self.not_applicable_reason.strip():
                raise PydanticCustomError(
                    "attenuation_not_applicable_reason_required",
                    "G.652.D not-applicable attenuation results require a nonblank reason.",
                )
            return self

        if any(value is None for value in comparison_values):
            raise PydanticCustomError(
                "attenuation_comparison_fields_required",
                "G.652.D applicable attenuation results require limit band, maximum, and margin.",
            )
        if self.not_applicable_reason is not None:
            raise PydanticCustomError(
                "attenuation_not_applicable_reason_forbidden",
                "G.652.D applicable attenuation results must omit a not-applicable reason.",
            )
        return self


class G652DDispersionFitRegion(StrEnum):
    THREE_TERM_SELLMEIER = "three_term_sellmeier"
    LINEAR = "linear"


class G652DDispersionCheckStatus(StrEnum):
    PASS = "pass"
    FAIL_BELOW_MINIMUM = "fail_below_minimum"
    FAIL_ABOVE_MAXIMUM = "fail_above_maximum"


class G652DDispersionCheckManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["itu_t_g652d_chromatic_dispersion_check"] = (
        "itu_t_g652d_chromatic_dispersion_check"
    )
    model_version: Literal["1.0.0"] = "1.0.0"
    envelope_model_id: Literal["itu_t_g652d_chromatic_dispersion_envelope"] = (
        "itu_t_g652d_chromatic_dispersion_envelope"
    )
    envelope_model_version: Literal["1.0.0"] = "1.0.0"
    standard_name: Literal["ITU-T G.652"] = "ITU-T G.652"
    standard_edition: Literal["08/2024"] = "08/2024"
    fibre_category: Literal["G.652.D"] = "G.652.D"
    comparison_rule: Literal["inclusive_envelope"] = "inclusive_envelope"
    assumptions: tuple[str, ...] = (
        "supplied chromatic-dispersion coefficient is compared at the same "
        "wavelength as the envelope",
        "values equal to either published envelope boundary pass",
        "signed margins are positive inside the envelope and negative beyond the violated boundary",
    )
    limitations: tuple[str, ...] = (
        "a passing dispersion check is not complete G.652.D conformance",
        "the supplied coefficient is accepted as input rather than measured or "
        "independently validated",
        "excludes measurement uncertainty, longitudinal variation, and statistical link design",
        "checks only the represented chromatic-dispersion coefficient attribute",
    )


class G652DDispersionCheckResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    wavelength_nm: float = Field(
        strict=True,
        ge=G652D_MIN_WAVELENGTH_NM,
        le=G652D_MAX_WAVELENGTH_NM,
        allow_inf_nan=False,
    )
    supplied_dispersion_ps_per_nm_km: float = Field(strict=True, allow_inf_nan=False)
    fit_region: G652DDispersionFitRegion
    minimum_dispersion_ps_per_nm_km: float = Field(strict=True, allow_inf_nan=False)
    maximum_dispersion_ps_per_nm_km: float = Field(strict=True, allow_inf_nan=False)
    margin_above_minimum_ps_per_nm_km: float = Field(strict=True, allow_inf_nan=False)
    margin_below_maximum_ps_per_nm_km: float = Field(strict=True, allow_inf_nan=False)
    status: G652DDispersionCheckStatus
    model_manifest: G652DDispersionCheckManifest

    @model_validator(mode="after")
    def validate_dispersion_check_bounds(self) -> Self:
        if self.minimum_dispersion_ps_per_nm_km > self.maximum_dispersion_ps_per_nm_km:
            raise PydanticCustomError(
                "dispersion_check_bounds_reversed",
                "G.652.D dispersion-check minimum cannot exceed maximum.",
            )
        return self


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
