from enum import StrEnum
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from fibre_sim.panda_mesh import PandaMeshRequest
from fibre_sim.photoelastic.geometry import PandaGeometry
from fibre_sim.photoelastic.loads import AxialLoad, ThermalState
from fibre_sim.photoelastic.materials import PandaMaterialSet

_StrictRefinementLevel = Annotated[int, Field(strict=True, ge=0, le=2)]
_PositiveFiniteFloat = Annotated[float, Field(strict=True, gt=0, allow_inf_nan=False)]
_NonNegativeFiniteFloat = Annotated[float, Field(strict=True, ge=0, allow_inf_nan=False)]
_OptionalFiniteFloat = Annotated[float, Field(strict=True, allow_inf_nan=False)] | None


class TorsionCapability(StrEnum):
    NONE = "none"
    SAINT_VENANT_HOMOGENEOUS_CIRCULAR_REFERENCE = "saint_venant_homogeneous_circular_reference"


class TorsionInputMode(StrEnum):
    TWIST_RATE = "twist_rate"
    APPLIED_TORQUE = "applied_torque"


class PandaScalarLp01ModeConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    wavelength_m: _PositiveFiniteFloat = 1.55e-6
    gaussian_mode_field_radius_m: _PositiveFiniteFloat = 5.0e-6


class PandaTorsionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    capability: TorsionCapability = TorsionCapability.NONE
    input_mode: TorsionInputMode | None = None
    twist_rate_per_m: _OptionalFiniteFloat = None
    applied_torque_n_m: _OptionalFiniteFloat = None

    @model_validator(mode="after")
    def validate_input(self) -> Self:
        if self.capability is TorsionCapability.NONE:
            if any(
                value is not None
                for value in (self.input_mode, self.twist_rate_per_m, self.applied_torque_n_m)
            ):
                raise PydanticCustomError(
                    "torsion_disabled_fields",
                    "Torsion inputs must be empty when torsion capability is none.",
                )
            return self
        if self.input_mode is TorsionInputMode.TWIST_RATE:
            valid = self.twist_rate_per_m is not None and self.applied_torque_n_m is None
        elif self.input_mode is TorsionInputMode.APPLIED_TORQUE:
            valid = self.twist_rate_per_m is None and self.applied_torque_n_m is not None
        else:
            valid = False
        if not valid:
            raise PydanticCustomError(
                "torsion_input_inconsistent",
                "Torsion requires exactly one matching twist-rate or torque input.",
            )
        return self


class PandaThermalFemRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    geometry: PandaGeometry
    materials: PandaMaterialSet
    thermal: ThermalState
    axial_load: AxialLoad
    lateral_pressure_pa: _NonNegativeFiniteFloat = 0.0
    optical_mode: PandaScalarLp01ModeConfig = Field(default_factory=PandaScalarLp01ModeConfig)
    torsion: PandaTorsionRequest = Field(default_factory=PandaTorsionRequest)
    refinement_level: _StrictRefinementLevel = 1

    def mesh_request(self, refinement_level: int | None = None) -> PandaMeshRequest:
        level = self.refinement_level if refinement_level is None else refinement_level
        return PandaMeshRequest(geometry=self.geometry, refinement_level=level)


__all__ = [
    "PandaScalarLp01ModeConfig",
    "PandaThermalFemRequest",
    "PandaTorsionRequest",
    "TorsionCapability",
    "TorsionInputMode",
]
