from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from .constants import G652D_MAX_WAVELENGTH_NM, G652D_MIN_WAVELENGTH_NM
from .result import G652DDispersionEnvelopeManifest


class G652DStandardLimits(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    mode_field_diameter_reference_wavelength_nm: float = Field(
        default=1310.0,
        strict=True,
        ge=G652D_MIN_WAVELENGTH_NM,
        le=G652D_MAX_WAVELENGTH_NM,
        allow_inf_nan=False,
    )
    mode_field_diameter_nominal_min_um: float = Field(
        default=8.6,
        strict=True,
        ge=0,
        allow_inf_nan=False,
    )
    mode_field_diameter_nominal_max_um: float = Field(
        default=9.2,
        strict=True,
        ge=0,
        allow_inf_nan=False,
    )
    mode_field_diameter_tolerance_um: float = Field(
        default=0.4,
        strict=True,
        ge=0,
        allow_inf_nan=False,
    )
    cladding_diameter_nominal_um: float = Field(
        default=125.0,
        strict=True,
        ge=0,
        allow_inf_nan=False,
    )
    cladding_diameter_tolerance_um: float = Field(
        default=0.7,
        strict=True,
        ge=0,
        allow_inf_nan=False,
    )
    core_concentricity_error_max_um: float = Field(
        default=0.6,
        strict=True,
        ge=0,
        allow_inf_nan=False,
    )
    cladding_non_circularity_max_percent: float = Field(
        default=1.0,
        strict=True,
        ge=0,
        le=100,
        allow_inf_nan=False,
    )
    cable_cutoff_wavelength_max_nm: float = Field(
        default=1260.0,
        strict=True,
        ge=G652D_MIN_WAVELENGTH_NM,
        le=G652D_MAX_WAVELENGTH_NM,
        allow_inf_nan=False,
    )
    macrobend_radius_mm: float = Field(
        default=30.0,
        strict=True,
        gt=0,
        allow_inf_nan=False,
    )
    macrobend_turns: int = Field(default=100, strict=True, ge=1)
    macrobend_wavelength_nm: float = Field(
        default=1625.0,
        strict=True,
        ge=G652D_MIN_WAVELENGTH_NM,
        le=G652D_MAX_WAVELENGTH_NM,
        allow_inf_nan=False,
    )
    macrobend_max_loss_db: float = Field(
        default=0.1,
        strict=True,
        ge=0,
        allow_inf_nan=False,
    )
    proof_stress_min_gpa: float = Field(
        default=0.69,
        strict=True,
        ge=0,
        allow_inf_nan=False,
    )
    dispersion_envelope_manifest: G652DDispersionEnvelopeManifest = Field(
        default_factory=G652DDispersionEnvelopeManifest
    )
    attenuation_general_min_wavelength_nm: float = Field(
        default=1310.0,
        strict=True,
        ge=G652D_MIN_WAVELENGTH_NM,
        le=G652D_MAX_WAVELENGTH_NM,
        allow_inf_nan=False,
    )
    attenuation_general_max_wavelength_nm: float = Field(
        default=1625.0,
        strict=True,
        ge=G652D_MIN_WAVELENGTH_NM,
        le=G652D_MAX_WAVELENGTH_NM,
        allow_inf_nan=False,
    )
    attenuation_general_max_db_per_km: float = Field(
        default=0.4,
        strict=True,
        ge=0,
        allow_inf_nan=False,
    )
    attenuation_hydrogen_aged_center_wavelength_nm: float = Field(
        default=1383.0,
        strict=True,
        ge=G652D_MIN_WAVELENGTH_NM,
        le=G652D_MAX_WAVELENGTH_NM,
        allow_inf_nan=False,
    )
    attenuation_hydrogen_aged_tolerance_nm: float = Field(
        default=3.0,
        strict=True,
        ge=0,
        allow_inf_nan=False,
    )
    attenuation_hydrogen_aged_max_db_per_km: float = Field(
        default=0.4,
        strict=True,
        ge=0,
        allow_inf_nan=False,
    )
    attenuation_c_band_min_wavelength_nm: float = Field(
        default=1530.0,
        strict=True,
        ge=G652D_MIN_WAVELENGTH_NM,
        le=G652D_MAX_WAVELENGTH_NM,
        allow_inf_nan=False,
    )
    attenuation_c_band_max_wavelength_nm: float = Field(
        default=1565.0,
        strict=True,
        ge=G652D_MIN_WAVELENGTH_NM,
        le=G652D_MAX_WAVELENGTH_NM,
        allow_inf_nan=False,
    )
    attenuation_c_band_max_db_per_km: float = Field(
        default=0.3,
        strict=True,
        ge=0,
        allow_inf_nan=False,
    )
    pmd_sample_cable_count: int = Field(default=20, strict=True, ge=1)
    pmd_exceedance_probability_percent: float = Field(
        default=0.01,
        strict=True,
        ge=0,
        le=100,
        allow_inf_nan=False,
    )
    pmd_max_ps_per_sqrt_km: float = Field(
        default=0.2,
        strict=True,
        ge=0,
        allow_inf_nan=False,
    )
    source_reference: Literal["ITU-T G.652 (08/2024), Table 2"] = "ITU-T G.652 (08/2024), Table 2"

    @model_validator(mode="after")
    def validate_ordered_ranges(self) -> Self:
        if self.mode_field_diameter_nominal_min_um > self.mode_field_diameter_nominal_max_um:
            raise PydanticCustomError(
                "g652d_mfd_nominal_range_reversed",
                "G.652.D mode field diameter nominal minimum cannot exceed maximum.",
            )
        if self.attenuation_general_min_wavelength_nm > self.attenuation_general_max_wavelength_nm:
            raise PydanticCustomError(
                "g652d_general_attenuation_range_reversed",
                "G.652.D general attenuation wavelength minimum cannot exceed maximum.",
            )
        if self.attenuation_c_band_min_wavelength_nm > self.attenuation_c_band_max_wavelength_nm:
            raise PydanticCustomError(
                "g652d_c_band_range_reversed",
                "G.652.D C-band wavelength minimum cannot exceed maximum.",
            )
        return self


class G652DSimulationDefaults(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    reference_wavelength_nm: float = Field(
        default=1550.0,
        strict=True,
        ge=G652D_MIN_WAVELENGTH_NM,
        le=G652D_MAX_WAVELENGTH_NM,
        allow_inf_nan=False,
    )
    attenuation_db_per_km: float = Field(
        default=0.275,
        strict=True,
        ge=0,
        allow_inf_nan=False,
    )
    dispersion_ps_per_nm_km: float = Field(
        default=17.0,
        strict=True,
        allow_inf_nan=False,
    )
    source_reference: Literal["ITU-T G.652 (08/2024), Appendix I, Table I.1"] = (
        "ITU-T G.652 (08/2024), Appendix I, Table I.1"
    )
    default_kind: Literal["informative_design_example"] = "informative_design_example"
    limitations: tuple[str, ...] = (
        "these are not normative limits or a product guarantee",
        "these defaults do not supply core radius, refractive indices, or group index",
    )


class G652DPreset(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    preset_id: Literal["g652d_2024"] = "g652d_2024"
    model_id: Literal["itu_t_g652d_preset"] = "itu_t_g652d_preset"
    model_version: Literal["1.0.0"] = "1.0.0"
    standard_name: Literal["ITU-T G.652"] = "ITU-T G.652"
    standard_edition: Literal["08/2024"] = "08/2024"
    fibre_category: Literal["G.652.D"] = "G.652.D"
    limits: G652DStandardLimits = Field(default_factory=G652DStandardLimits)
    simulation_defaults: G652DSimulationDefaults = Field(default_factory=G652DSimulationDefaults)
    source_references: tuple[str, ...] = (
        "ITU-T G.652 (08/2024), Table 2",
        "ITU-T G.652 (08/2024), Appendix I, Table I.1",
    )
    assumptions: tuple[str, ...] = (
        "Table 2 values are represented as standard limits and Appendix I Table I.1 "
        "values are separate informative simulation defaults",
        "the nested dispersion envelope manifest represents the G.652.D "
        "chromatic-dispersion boundary equations",
    )
    limitations: tuple[str, ...] = (
        "the preset encodes attributes beyond the implemented checks",
        "mode-field diameter nominal range and tolerance are not a direct measured-value envelope",
        "the macrobend value is a qualification condition rather than a continuous bend-loss model",
        "the PMD value is statistical and is not deterministic group delay",
        "the preset is not a complete G.652.D conformance determination or product guarantee",
    )


def get_g652d_preset() -> G652DPreset:
    return G652DPreset(
        limits=G652DStandardLimits(dispersion_envelope_manifest=G652DDispersionEnvelopeManifest()),
        simulation_defaults=G652DSimulationDefaults(),
    )
