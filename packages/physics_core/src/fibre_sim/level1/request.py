from enum import StrEnum
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from fibre_sim.bends import MAX_MACROBENDS, MacrobendInput
from fibre_sim.modes import DEFAULT_GRID_POINTS, MAX_GRID_POINTS, MIN_GRID_POINTS
from fibre_sim.standards import G652DAttenuationApplication
from fibre_sim.standards.constants import G652D_MAX_WAVELENGTH_NM, G652D_MIN_WAVELENGTH_NM


class Level1FibrePreset(StrEnum):
    CUSTOM = "custom"
    G652D = "g652d"


_StrictFiniteFloat = Annotated[float, Field(strict=True, allow_inf_nan=False)]
_PositiveStrictFiniteFloat = Annotated[
    float,
    Field(strict=True, gt=0, allow_inf_nan=False),
]
_NonNegativeStrictFiniteFloat = Annotated[
    float,
    Field(strict=True, ge=0, allow_inf_nan=False),
]
_StrictGridPoints = Annotated[
    int,
    Field(strict=True, ge=MIN_GRID_POINTS, le=MAX_GRID_POINTS),
]


class Level1FibreConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    n_core: _PositiveStrictFiniteFloat
    n_cladding: _PositiveStrictFiniteFloat
    core_radius_um: _PositiveStrictFiniteFloat
    mode_field_radius_um: _PositiveStrictFiniteFloat
    attenuation_db_per_km: _NonNegativeStrictFiniteFloat
    dispersion_ps_per_nm_km: _StrictFiniteFloat
    group_index_dimensionless: _PositiveStrictFiniteFloat
    cable_application: G652DAttenuationApplication

    @model_validator(mode="after")
    def validate_refractive_index_order(self) -> Self:
        if self.n_core <= self.n_cladding:
            raise PydanticCustomError(
                "invalid_refractive_index_order",
                "Core refractive index must be greater than cladding refractive index.",
            )
        return self


class Level1SourceConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    wavelength_nm: _PositiveStrictFiniteFloat
    input_power_dbm: _StrictFiniteFloat
    spectral_width_fwhm_nm: _NonNegativeStrictFiniteFloat
    input_pulse_fwhm_ps: _PositiveStrictFiniteFloat


class Level1SectionConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    length_km: _NonNegativeStrictFiniteFloat
    bends: tuple[MacrobendInput, ...] = Field(default=(), max_length=MAX_MACROBENDS)

    @model_validator(mode="after")
    def validate_bend_positions(self) -> Self:
        positions = tuple(bend.position_fraction for bend in self.bends)
        if any(
            current >= following
            for current, following in zip(positions, positions[1:], strict=False)
        ):
            raise PydanticCustomError(
                "bend_positions_not_strictly_increasing",
                "Macrobend positions must be strictly increasing in propagation order.",
            )
        return self


class Level1SamplingConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    grid_half_width_um: _PositiveStrictFiniteFloat
    grid_points: _StrictGridPoints = DEFAULT_GRID_POINTS

    @model_validator(mode="after")
    def validate_grid_points_are_odd(self) -> Self:
        if self.grid_points % 2 == 0:
            raise PydanticCustomError(
                "grid_points_must_be_odd",
                "Grid points must be odd so the sampling grid contains the origin.",
            )
        return self


class Level1SimulationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    preset: Level1FibrePreset
    fibre: Level1FibreConfig
    source: Level1SourceConfig
    section: Level1SectionConfig
    sampling: Level1SamplingConfig

    @model_validator(mode="after")
    def validate_preset_wavelength_domain(self) -> Self:
        if self.preset is Level1FibrePreset.G652D and not (
            G652D_MIN_WAVELENGTH_NM <= self.source.wavelength_nm <= G652D_MAX_WAVELENGTH_NM
        ):
            raise PydanticCustomError(
                "g652d_wavelength_outside_preset_domain",
                "G.652.D preset wavelength must be between 1260 nm and 1625 nm inclusive.",
            )
        return self
