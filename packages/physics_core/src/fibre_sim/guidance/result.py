from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .calculations import (
    AirAcceptanceAngleError,
    air_acceptance_angle_deg,
    critical_angle_deg,
    numerical_aperture,
    relative_index_difference,
    v_number,
)
from .classification import LP11_CUTOFF_V, ModeRegime, classify_mode_regime
from .mode_count import (
    ASYMPTOTIC_MODE_COUNT_MIN_V,
    ModeCountValidityError,
    approximate_mode_count,
)
from .request import GuidanceRequest


class GuidanceWarningCode(StrEnum):
    AIR_ACCEPTANCE_ANGLE_UNAVAILABLE = "air_acceptance_angle_unavailable"
    MODE_COUNT_UNAVAILABLE = "mode_count_unavailable"


class GuidanceWarning(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    code: GuidanceWarningCode
    message: str
    output_field: Literal["air_acceptance_angle_deg", "approximate_mode_count"]


class GuidanceModelManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["ideal_circular_step_index_guidance"] = "ideal_circular_step_index_guidance"
    model_version: Literal["1.0.0"] = "1.0.0"
    mode_regime_cutoff_v_dimensionless: float = Field(default=LP11_CUTOFF_V, allow_inf_nan=False)
    mode_count_min_v_dimensionless: float = Field(
        default=ASYMPTOTIC_MODE_COUNT_MIN_V, allow_inf_nan=False
    )
    assumptions: tuple[str, ...] = (
        "ideal circular step-index profile",
        "scalar weak-guidance mode interpretation",
        "homogeneous, isotropic, linear media",
        "n_external=1 for air angle",
    )
    limitations: tuple[str, ...] = (
        "asymptotic mode count only at V >= 10.0 project threshold",
        "V=2.405 ideal cutoff distinct from measured cable cutoff",
        "not a G.652.D conformance model",
    )


class GuidanceResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    critical_angle_deg: float = Field(allow_inf_nan=False)
    numerical_aperture_dimensionless: float = Field(allow_inf_nan=False)
    air_acceptance_angle_deg: float | None = Field(default=None, allow_inf_nan=False)
    relative_index_difference_dimensionless: float = Field(allow_inf_nan=False)
    v_number_dimensionless: float = Field(allow_inf_nan=False)
    mode_regime: ModeRegime
    approximate_mode_count: float | None = Field(default=None, allow_inf_nan=False)
    warnings: tuple[GuidanceWarning, ...]
    model_manifest: GuidanceModelManifest


def calculate_guidance(request: GuidanceRequest) -> GuidanceResult:
    warnings: list[GuidanceWarning] = []

    try:
        air_acceptance_angle = air_acceptance_angle_deg(request)
    except AirAcceptanceAngleError as error:
        air_acceptance_angle = None
        warnings.append(
            GuidanceWarning(
                code=GuidanceWarningCode.AIR_ACCEPTANCE_ANGLE_UNAVAILABLE,
                message=str(error),
                output_field="air_acceptance_angle_deg",
            )
        )

    try:
        mode_count = approximate_mode_count(request)
    except ModeCountValidityError as error:
        mode_count = None
        warnings.append(
            GuidanceWarning(
                code=GuidanceWarningCode.MODE_COUNT_UNAVAILABLE,
                message=str(error),
                output_field="approximate_mode_count",
            )
        )

    return GuidanceResult(
        critical_angle_deg=critical_angle_deg(request),
        numerical_aperture_dimensionless=numerical_aperture(request),
        air_acceptance_angle_deg=air_acceptance_angle,
        relative_index_difference_dimensionless=relative_index_difference(request),
        v_number_dimensionless=v_number(request),
        mode_regime=classify_mode_regime(request),
        approximate_mode_count=mode_count,
        warnings=tuple(warnings),
        model_manifest=GuidanceModelManifest(),
    )
