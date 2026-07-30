from enum import StrEnum
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

_StrictFiniteFloat = Annotated[float, Field(strict=True, allow_inf_nan=False)]
_PositiveStrictFiniteFloat = Annotated[
    float,
    Field(strict=True, gt=0, allow_inf_nan=False),
]
_OptionalStrictFiniteFloat = Annotated[
    float,
    Field(strict=True, allow_inf_nan=False),
] | None


class ThermalState(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    temperature_k: _PositiveStrictFiniteFloat
    effective_fictive_temperature_k: _PositiveStrictFiniteFloat


class AxialCondition(StrEnum):
    FREE_RESULTANT = "free_resultant"
    PRESCRIBED_FORCE = "prescribed_force"
    PRESCRIBED_STRAIN = "prescribed_strain"


class AxialLoad(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    condition: AxialCondition
    prescribed_strain: _OptionalStrictFiniteFloat = None
    prescribed_force_n: _OptionalStrictFiniteFloat = None

    @model_validator(mode="after")
    def validate_condition_fields(self) -> Self:
        if self.condition is AxialCondition.FREE_RESULTANT:
            valid = self.prescribed_strain is None and self.prescribed_force_n is None
        elif self.condition is AxialCondition.PRESCRIBED_FORCE:
            valid = self.prescribed_strain is None and self.prescribed_force_n is not None
        else:
            valid = self.prescribed_strain is not None and self.prescribed_force_n is None

        if not valid:
            raise PydanticCustomError(
                "axial_condition_fields_inconsistent",
                "Axial load fields must match the selected axial condition.",
            )
        return self


__all__ = ["AxialCondition", "AxialLoad", "ThermalState"]
