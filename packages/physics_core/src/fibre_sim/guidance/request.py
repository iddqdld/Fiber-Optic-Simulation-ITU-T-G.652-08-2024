from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError


class GuidanceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    n_core: float = Field(gt=0, allow_inf_nan=False)
    n_cladding: float = Field(gt=0, allow_inf_nan=False)
    core_radius_um: float = Field(gt=0, allow_inf_nan=False)
    wavelength_nm: float = Field(gt=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_refractive_index_order(self) -> Self:
        if self.n_core <= self.n_cladding:
            raise PydanticCustomError(
                "invalid_refractive_index_order",
                "Core refractive index must be greater than cladding refractive index.",
            )
        return self
