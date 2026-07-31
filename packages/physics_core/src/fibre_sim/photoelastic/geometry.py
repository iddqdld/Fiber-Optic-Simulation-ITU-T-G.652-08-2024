import math
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

_StrictFiniteFloat = Annotated[float, Field(strict=True, allow_inf_nan=False)]
_PositiveStrictFiniteFloat = Annotated[
    float,
    Field(strict=True, gt=0, allow_inf_nan=False),
]


class CircularSAP(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    radius_m: _PositiveStrictFiniteFloat
    center_x_m: _StrictFiniteFloat
    center_y_m: _StrictFiniteFloat


class PandaGeometry(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    core_radius_m: _PositiveStrictFiniteFloat
    cladding_radius_m: _PositiveStrictFiniteFloat
    core_center_x_m: _StrictFiniteFloat
    core_center_y_m: _StrictFiniteFloat
    sap_1: CircularSAP
    sap_2: CircularSAP

    @model_validator(mode="after")
    def validate_circle_relationships(self) -> Self:
        if self.core_radius_m >= self.cladding_radius_m:
            raise PydanticCustomError(
                "core_not_inside_cladding",
                "Core radius must be smaller than cladding radius.",
            )

        core_center_distance = math.hypot(self.core_center_x_m, self.core_center_y_m)
        if core_center_distance + self.core_radius_m > self.cladding_radius_m:
            raise PydanticCustomError(
                "core_outside_cladding",
                "Core circle must be fully contained inside the cladding circle.",
            )

        saps = (("sap_1", self.sap_1), ("sap_2", self.sap_2))
        for name, sap in saps:
            cladding_center_distance = math.hypot(sap.center_x_m, sap.center_y_m)
            if cladding_center_distance + sap.radius_m > self.cladding_radius_m:
                raise PydanticCustomError(
                    "sap_outside_cladding",
                    f"{name} must be fully contained inside the cladding circle.",
                )
            core_distance = math.hypot(
                sap.center_x_m - self.core_center_x_m,
                sap.center_y_m - self.core_center_y_m,
            )
            if core_distance < self.core_radius_m + sap.radius_m:
                raise PydanticCustomError(
                    "sap_overlaps_core",
                    f"{name} must not overlap the core circle.",
                )

        sap_distance = math.hypot(
            self.sap_1.center_x_m - self.sap_2.center_x_m,
            self.sap_1.center_y_m - self.sap_2.center_y_m,
        )
        if sap_distance < self.sap_1.radius_m + self.sap_2.radius_m:
            raise PydanticCustomError(
                "saps_overlap",
                "SAP circles must not overlap each other.",
            )
        return self


__all__ = ["CircularSAP", "PandaGeometry"]
