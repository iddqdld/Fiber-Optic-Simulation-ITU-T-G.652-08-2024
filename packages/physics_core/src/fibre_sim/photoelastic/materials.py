from enum import StrEnum
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from .conventions import PhotoelasticConvention

_StrictFiniteFloat = Annotated[float, Field(strict=True, allow_inf_nan=False)]
_PositiveStrictFiniteFloat = Annotated[
    float,
    Field(strict=True, gt=0, allow_inf_nan=False),
]
_OptionalStrictFiniteFloat = Annotated[
    float,
    Field(strict=True, allow_inf_nan=False),
] | None
_StrictText = Annotated[str, Field(strict=True, min_length=1)]
_OptionalStrictText = Annotated[str, Field(strict=True, min_length=1)] | None


class MaterialConfidence(StrEnum):
    MEASURED_SAMPLE = "measured_sample"
    MANUFACTURER = "manufacturer"
    LITERATURE_COMPOSITION = "literature_composition"
    CALIBRATED_EFFECTIVE = "calibrated_effective"
    DEMONSTRATION_ONLY = "demonstration_only"


class MaterialSource(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    citation: _StrictText
    confidence: MaterialConfidence
    source_date: _OptionalStrictText = None
    notes: str = Field(default="", strict=True)


class PandaMaterial(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: _StrictText
    composition: _OptionalStrictText = None
    young_modulus_pa: _PositiveStrictFiniteFloat
    poisson_ratio: float = Field(strict=True, gt=-1, lt=0.5, allow_inf_nan=False)
    cte_per_k: _StrictFiniteFloat
    refractive_index: _PositiveStrictFiniteFloat
    p11: _OptionalStrictFiniteFloat = None
    p12: _OptionalStrictFiniteFloat = None
    c1_per_pa: _OptionalStrictFiniteFloat = None
    c2_per_pa: _OptionalStrictFiniteFloat = None
    photoelastic_convention: PhotoelasticConvention
    source: MaterialSource

    @model_validator(mode="after")
    def validate_photoelastic_coefficients(self) -> Self:
        strain_coefficients_present = self.p11 is not None and self.p12 is not None
        strain_coefficients_partial = (self.p11 is None) != (self.p12 is None)
        stress_optic_coefficients_present = (
            self.c1_per_pa is not None and self.c2_per_pa is not None
        )
        stress_optic_coefficients_partial = (self.c1_per_pa is None) != (
            self.c2_per_pa is None
        )

        if strain_coefficients_partial or stress_optic_coefficients_partial:
            raise PydanticCustomError(
                "incomplete_photoelastic_convention",
                "Both coefficients of the selected photoelastic convention are required.",
            )

        if self.photoelastic_convention is PhotoelasticConvention.P11_P12_STRAIN:
            valid = strain_coefficients_present and not stress_optic_coefficients_present
        else:
            valid = stress_optic_coefficients_present and not strain_coefficients_present

        if not valid:
            raise PydanticCustomError(
                "photoelastic_convention_mismatch",
                "Exactly one supported photoelastic coefficient pair must match "
                "the selected convention.",
            )
        return self


class PandaMaterialSet(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    core: PandaMaterial
    cladding: PandaMaterial
    sap_1: PandaMaterial
    sap_2: PandaMaterial


__all__ = ["MaterialConfidence", "MaterialSource", "PandaMaterial", "PandaMaterialSet"]
