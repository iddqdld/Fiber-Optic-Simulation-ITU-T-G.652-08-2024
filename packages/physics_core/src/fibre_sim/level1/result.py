from enum import StrEnum
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, model_validator
from pydantic_core import PydanticCustomError

from fibre_sim.attenuation import ConstantAttenuationResult
from fibre_sim.bends import MacrobendLossResult
from fibre_sim.dispersion import ChromaticPulseBroadeningResult, GroupDelayResult
from fibre_sim.guidance import GuidanceResult
from fibre_sim.modes import GaussianModeProfileResult
from fibre_sim.standards import (
    G652DAttenuationCheckResult,
    G652DDispersionCheckResult,
    G652DPreset,
)

from .boundaries import Level1ParameterBoundary
from .request import Level1FibrePreset, Level1SimulationRequest


class Level1WarningCode(StrEnum):
    AIR_ACCEPTANCE_ANGLE_UNAVAILABLE = "air_acceptance_angle_unavailable"
    MODE_COUNT_UNAVAILABLE = "mode_count_unavailable"
    G652D_ATTENUATION_NOT_APPLICABLE = "g652d_attenuation_not_applicable"


class Level1Warning(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    code: Level1WarningCode
    source_model_id: str
    message: str
    output_field: str


class Level1StandardsChecks(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    preset: Level1FibrePreset
    preset_definition: G652DPreset | None
    dispersion: G652DDispersionCheckResult | None
    attenuation: G652DAttenuationCheckResult | None

    @model_validator(mode="after")
    def validate_checks_match_preset(self) -> Self:
        detail_values = (self.preset_definition, self.dispersion, self.attenuation)
        if self.preset is Level1FibrePreset.CUSTOM and any(
            value is not None for value in detail_values
        ):
            raise PydanticCustomError(
                "custom_preset_standards_checks_must_be_none",
                "Custom preset requires preset_definition, dispersion, and attenuation "
                "standards checks to be None.",
            )
        if self.preset is Level1FibrePreset.G652D and any(value is None for value in detail_values):
            raise PydanticCustomError(
                "g652d_preset_standards_checks_required",
                "G.652.D preset requires preset_definition, dispersion, and attenuation "
                "standards checks.",
            )
        return self


class Level1SimulationManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["level1_single_section_simulation"] = "level1_single_section_simulation"
    model_version: Literal["1.1.0"] = "1.1.0"
    component_model_ids: tuple[str, ...]
    assumptions: tuple[str, ...] = (
        "one uniform fibre section",
        "all calculations share one operating wavelength",
        "fibre composition is uniform over the section",
        "user-supplied bend losses are applied after straight-fibre attenuation",
    )
    limitations: tuple[str, ...] = (
        "bend geometry does not derive bend loss",
        "excludes splices and connectors",
        "excludes polarization-mode dispersion",
        "excludes optical nonlinearity",
        "excludes multi-section links",
        "excludes full-wave field solving",
    )


class Level1SimulationResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    configuration: Level1SimulationRequest
    guidance: GuidanceResult
    mode_profile: GaussianModeProfileResult
    attenuation: ConstantAttenuationResult
    bend_loss: MacrobendLossResult
    group_delay: GroupDelayResult
    pulse_broadening: ChromaticPulseBroadeningResult
    standards_checks: Level1StandardsChecks
    parameter_boundaries: tuple[Level1ParameterBoundary, ...]
    warnings: tuple[Level1Warning, ...]
    model_manifest: Level1SimulationManifest

    @model_validator(mode="after")
    def validate_bend_loss_pipeline(self) -> Self:
        if self.bend_loss.input_power_dbm != self.attenuation.output_power_dbm:
            raise PydanticCustomError(
                "bend_loss_input_power_mismatch",
                "Macrobend input power must equal straight-fibre attenuation output power.",
            )

        configured_bends = tuple(
            (
                bend.position_fraction,
                bend.radius_mm,
                bend.angle_deg,
                bend.supplied_loss_db,
            )
            for bend in self.configuration.section.bends
        )
        result_bends = tuple(
            (
                bend.position_fraction,
                bend.radius_mm,
                bend.angle_deg,
                bend.supplied_loss_db,
            )
            for bend in self.bend_loss.bends
        )
        if configured_bends != result_bends:
            raise PydanticCustomError(
                "bend_loss_configuration_mismatch",
                "Macrobend results must match the configured bend inputs in order.",
            )
        return self
