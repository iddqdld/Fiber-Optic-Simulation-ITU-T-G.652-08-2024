from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from fibre_sim.guidance import ModeRegime
from fibre_sim.level1 import Level1WarningCode
from fibre_sim.standards import G652DAttenuationCheckStatus, G652DDispersionCheckStatus

from .request import Level1SweepRequest

_StrictFiniteFloat = Field(strict=True, allow_inf_nan=False)
_Level1SweepParameterUnit = Literal[
    "dimensionless",
    "µm",
    "dB/km",
    "ps/(nm·km)",
    "nm",
    "dBm",
    "ps",
    "km",
]


class Level1SweepPoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    parameter_value: float = Field(
        strict=True,
        allow_inf_nan=False,
        description="Evaluated request parameter value in the result parameter_unit.",
    )
    numerical_aperture_dimensionless: float = _StrictFiniteFloat
    v_number_dimensionless: float = _StrictFiniteFloat
    mode_regime: ModeRegime
    approximate_mode_count: float | None = Field(
        default=None,
        strict=True,
        allow_inf_nan=False,
    )
    section_loss_db: float = _StrictFiniteFloat
    output_power_dbm: float = _StrictFiniteFloat
    group_delay_ps: float = _StrictFiniteFloat
    dispersion_broadening_fwhm_ps: float = _StrictFiniteFloat
    output_pulse_fwhm_ps: float = _StrictFiniteFloat
    warning_codes: tuple[Level1WarningCode, ...]
    dispersion_standard_status: G652DDispersionCheckStatus | None = None
    attenuation_standard_status: G652DAttenuationCheckStatus | None = None


class Level1SweepManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["level1_one_parameter_sweep"] = "level1_one_parameter_sweep"
    model_version: Literal["1.0.0"] = "1.0.0"
    component_model_id: Literal["level1_single_section_simulation"] = (
        "level1_single_section_simulation"
    )
    spacing: Literal["linear"] = "linear"
    max_sample_count: Literal[200] = 200
    assumptions: tuple[str, ...] = (
        "each sweep point is an independent deterministic Level 1 evaluation",
        "only the selected parameter changes between points",
    )
    limitations: tuple[str, ...] = (
        "does not interpolate between evaluated points",
        "does not calculate statistics or confidence intervals",
        "runs synchronously without worker parallelism",
    )


class Level1SweepResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    request: Level1SweepRequest
    parameter_unit: _Level1SweepParameterUnit = Field(
        description="Unit shared by request start_value, stop_value, and point parameter_value."
    )
    points: tuple[Level1SweepPoint, ...] = Field(min_length=2, max_length=200)
    model_manifest: Level1SweepManifest


__all__ = ["Level1SweepManifest", "Level1SweepPoint", "Level1SweepResult"]
