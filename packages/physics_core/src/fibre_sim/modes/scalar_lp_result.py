import math
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from .request import MAX_GRID_POINTS, MIN_GRID_POINTS
from .scalar_lp_step_index import MAX_SCALAR_LP_MODE_FAMILIES

_PositiveFiniteFloat = Annotated[float, Field(strict=True, gt=0, allow_inf_nan=False)]
_NonNegativeFiniteFloat = Annotated[
    float,
    Field(strict=True, ge=0, allow_inf_nan=False),
]
_FiniteFloat = Annotated[float, Field(strict=True, allow_inf_nan=False)]
_UnitFloat = Annotated[float, Field(strict=True, ge=0, le=1, allow_inf_nan=False)]
_SignedUnitFloat = Annotated[
    float,
    Field(strict=True, ge=-1, le=1, allow_inf_nan=False),
]
_GridPoints = Annotated[
    int,
    Field(strict=True, ge=MIN_GRID_POINTS, le=MAX_GRID_POINTS),
]


def _close(left: float, right: float) -> bool:
    return math.isclose(left, right, rel_tol=1e-10, abs_tol=1e-12)


class ScalarLPModeManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["scalar_lp_step_index_modes"] = "scalar_lp_step_index_modes"
    model_version: Literal["1.0.0"] = "1.0.0"
    catalog_label: Literal["Supported scalar LP modes — weak-guidance step-index model"] = (
        "Supported scalar LP modes — weak-guidance step-index model"
    )
    field_label: Literal["Scalar LP mode field — weak-guidance step-index model"] = (
        "Scalar LP mode field — weak-guidance step-index model"
    )
    field_normalization: Literal["unit_peak_absolute_field"] = "unit_peak_absolute_field"
    angular_basis: Literal["cosine_representative"] = "cosine_representative"
    excitation_status: Literal["not_calculated"] = "not_calculated"
    assumptions: tuple[str, ...] = (
        "ideal circular step-index core and cladding",
        "scalar weak-guidance LP mode equation",
        "infinite cladding with a decaying modified-Bessel tail",
        "one real cosine representative for each spatial mode family",
    )
    limitations: tuple[str, ...] = (
        "supported modes are not necessarily excited by the source",
        "no launch overlap, modal power, polarization, or mode coupling",
        "no vector electromagnetic components or longitudinal field components",
        "no bend-aware field displacement or radiation pattern",
        "ideal modal cutoffs are not measured G.652.D cable cutoffs",
        "exact Bessel cutoffs can differ slightly from the rounded V=2.405 boundary",
    )


class ScalarLPModeFamilyResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    label: str = Field(min_length=4, max_length=12)
    azimuthal_order: Annotated[int, Field(strict=True, ge=0, le=64)]
    radial_order: Annotated[int, Field(strict=True, ge=1, le=64)]
    spatial_degeneracy: Literal[1, 2]
    cutoff_v_dimensionless: _NonNegativeFiniteFloat
    v_number_dimensionless: _PositiveFiniteFloat
    u_dimensionless: _PositiveFiniteFloat
    w_dimensionless: _PositiveFiniteFloat
    normalized_propagation_constant: _UnitFloat
    effective_index_dimensionless: _PositiveFiniteFloat
    beta_per_m: _PositiveFiniteFloat

    @model_validator(mode="after")
    def validate_mode_identity(self) -> Self:
        if self.label != f"LP{self.azimuthal_order}{self.radial_order}":
            raise PydanticCustomError(
                "scalar_lp_label_mismatch",
                "The LP mode label must match its azimuthal and radial orders.",
            )
        expected_degeneracy = 1 if self.azimuthal_order == 0 else 2
        if self.spatial_degeneracy != expected_degeneracy:
            raise PydanticCustomError(
                "scalar_lp_degeneracy_mismatch",
                "The scalar LP spatial degeneracy does not match its azimuthal order.",
            )
        if self.v_number_dimensionless <= self.cutoff_v_dimensionless:
            raise PydanticCustomError(
                "scalar_lp_mode_not_guided",
                "A supported scalar LP mode requires V greater than its ideal cutoff.",
            )
        if not _close(
            self.u_dimensionless**2 + self.w_dimensionless**2,
            self.v_number_dimensionless**2,
        ):
            raise PydanticCustomError(
                "scalar_lp_transverse_relation_mismatch",
                "The scalar LP mode must satisfy u squared plus w squared equals V squared.",
            )
        if not _close(
            self.normalized_propagation_constant,
            (self.w_dimensionless / self.v_number_dimensionless) ** 2,
        ):
            raise PydanticCustomError(
                "scalar_lp_normalized_beta_mismatch",
                "The normalized propagation constant must equal w squared over V squared.",
            )
        return self


class ScalarLPModeCatalogResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    wavelength_m: _PositiveFiniteFloat
    core_radius_m: _PositiveFiniteFloat
    n_core: _PositiveFiniteFloat
    n_cladding: _PositiveFiniteFloat
    v_number_dimensionless: _PositiveFiniteFloat
    mode_regime: Literal["single_mode", "multimode"]
    mode_families: tuple[ScalarLPModeFamilyResult, ...] = Field(
        min_length=1,
        max_length=MAX_SCALAR_LP_MODE_FAMILIES,
    )
    catalog_truncated: bool
    warnings: tuple[str, ...] = ()
    model_manifest: ScalarLPModeManifest

    @model_validator(mode="after")
    def validate_catalog(self) -> Self:
        if self.n_core <= self.n_cladding:
            raise PydanticCustomError(
                "invalid_refractive_index_order",
                "Core refractive index must be greater than cladding refractive index.",
            )
        if self.mode_families[0].label != "LP01":
            raise PydanticCustomError(
                "scalar_lp_fundamental_missing",
                "The supported scalar LP catalog must start with LP01.",
            )
        labels = tuple(mode.label for mode in self.mode_families)
        if len(set(labels)) != len(labels):
            raise PydanticCustomError(
                "scalar_lp_duplicate_mode",
                "The supported scalar LP catalog cannot contain duplicate mode families.",
            )
        k0_per_m = 2.0 * math.pi / self.wavelength_m
        expected_v = k0_per_m * self.core_radius_m * math.sqrt(self.n_core**2 - self.n_cladding**2)
        if not _close(self.v_number_dimensionless, expected_v):
            raise PydanticCustomError(
                "scalar_lp_catalog_v_mismatch",
                "The supported scalar LP catalog V-number must match its optical inputs.",
            )
        if any(
            not _close(mode.v_number_dimensionless, self.v_number_dimensionless)
            or not self.n_cladding < mode.effective_index_dimensionless < self.n_core
            or not _close(
                mode.beta_per_m,
                k0_per_m * mode.effective_index_dimensionless,
            )
            for mode in self.mode_families
        ):
            raise PydanticCustomError(
                "scalar_lp_catalog_mode_mismatch",
                "Each scalar LP mode must match the catalog optical inputs.",
            )
        if any(
            current.cutoff_v_dimensionless < previous.cutoff_v_dimensionless
            for previous, current in zip(
                self.mode_families,
                self.mode_families[1:],
                strict=False,
            )
        ):
            raise PydanticCustomError(
                "scalar_lp_catalog_order_mismatch",
                "Scalar LP mode families must be ordered by ideal cutoff.",
            )
        expected_regime = "single_mode" if len(self.mode_families) == 1 else "multimode"
        if not self.catalog_truncated and self.mode_regime != expected_regime:
            raise PydanticCustomError(
                "scalar_lp_regime_mismatch",
                "The mode regime must match the complete supported mode catalog.",
            )
        return self


class ScalarLPModeFieldResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    wavelength_m: _PositiveFiniteFloat
    core_radius_m: _PositiveFiniteFloat
    n_core: _PositiveFiniteFloat
    n_cladding: _PositiveFiniteFloat
    selected_mode: ScalarLPModeFamilyResult
    grid_half_width_m: _PositiveFiniteFloat
    grid_points: _GridPoints
    x_m: tuple[_FiniteFloat, ...]
    y_m: tuple[_FiniteFloat, ...]
    normalized_field: tuple[tuple[_SignedUnitFloat, ...], ...]
    normalized_intensity: tuple[tuple[_UnitFloat, ...], ...]
    model_manifest: ScalarLPModeManifest

    @model_validator(mode="after")
    def validate_field_grid(self) -> Self:
        if self.grid_points % 2 == 0:
            raise PydanticCustomError(
                "grid_points_must_be_odd",
                "Grid points must be odd so the sampling grid contains the origin.",
            )
        grids = (self.normalized_field, self.normalized_intensity)
        if len(self.x_m) != self.grid_points or len(self.y_m) != self.grid_points:
            raise PydanticCustomError(
                "profile_axis_length_mismatch",
                "Profile axes must each contain exactly grid_points values.",
            )
        if any(
            len(grid) != self.grid_points or any(len(row) != self.grid_points for row in grid)
            for grid in grids
        ):
            raise PydanticCustomError(
                "profile_grid_shape_mismatch",
                "Profile grids must contain exactly grid_points rows and columns.",
            )
        k0_per_m = 2.0 * math.pi / self.wavelength_m
        expected_v = k0_per_m * self.core_radius_m * math.sqrt(self.n_core**2 - self.n_cladding**2)
        if (
            self.n_core <= self.n_cladding
            or not _close(self.selected_mode.v_number_dimensionless, expected_v)
            or not self.n_cladding < self.selected_mode.effective_index_dimensionless < self.n_core
            or not _close(
                self.selected_mode.beta_per_m,
                k0_per_m * self.selected_mode.effective_index_dimensionless,
            )
        ):
            raise PydanticCustomError(
                "scalar_lp_field_mode_mismatch",
                "The selected scalar LP mode must match the field optical inputs.",
            )
        center = self.grid_points // 2
        if (
            self.x_m[center] != 0.0
            or self.y_m[center] != 0.0
            or not _close(self.x_m[0], -self.grid_half_width_m)
            or not _close(self.x_m[-1], self.grid_half_width_m)
            or not _close(self.y_m[0], -self.grid_half_width_m)
            or not _close(self.y_m[-1], self.grid_half_width_m)
            or any(right <= left for left, right in zip(self.x_m, self.x_m[1:], strict=False))
            or any(right <= left for left, right in zip(self.y_m, self.y_m[1:], strict=False))
            or any(not _close(value, -self.x_m[-index - 1]) for index, value in enumerate(self.x_m))
            or any(not _close(value, -self.y_m[-index - 1]) for index, value in enumerate(self.y_m))
        ):
            raise PydanticCustomError(
                "scalar_lp_field_axis_mismatch",
                "Scalar LP field axes must be increasing and symmetric about zero.",
            )
        maximum_absolute_field = max(abs(value) for row in self.normalized_field for value in row)
        if not _close(maximum_absolute_field, 1.0) or any(
            not _close(intensity, field * field)
            for field_row, intensity_row in zip(
                self.normalized_field,
                self.normalized_intensity,
                strict=True,
            )
            for field, intensity in zip(field_row, intensity_row, strict=True)
        ):
            raise PydanticCustomError(
                "scalar_lp_field_normalization_mismatch",
                "The scalar LP field must have unit peak magnitude and squared intensity.",
            )
        return self
