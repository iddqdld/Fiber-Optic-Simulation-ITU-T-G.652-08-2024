from __future__ import annotations

import math
from enum import StrEnum
from typing import TYPE_CHECKING, Final

from pydantic import BaseModel, ConfigDict, Field

from fibre_sim.guidance import GuidanceResult
from fibre_sim.modes import MAX_GRID_POINTS, MIN_GRID_POINTS
from fibre_sim.standards.constants import G652D_MAX_WAVELENGTH_NM, G652D_MIN_WAVELENGTH_NM

from .request import Level1FibrePreset, Level1SimulationRequest

if TYPE_CHECKING:
    from .result import Level1StandardsChecks


class Level1ParameterField(StrEnum):
    N_CORE = "n_core"
    N_CLADDING = "n_cladding"
    CORE_RADIUS_UM = "core_radius_um"
    MODE_FIELD_RADIUS_UM = "mode_field_radius_um"
    ATTENUATION_DB_PER_KM = "attenuation_db_per_km"
    DISPERSION_PS_PER_NM_KM = "dispersion_ps_per_nm_km"
    GROUP_INDEX_DIMENSIONLESS = "group_index_dimensionless"
    WAVELENGTH_NM = "wavelength_nm"
    INPUT_POWER_DBM = "input_power_dbm"
    SPECTRAL_WIDTH_FWHM_NM = "spectral_width_fwhm_nm"
    INPUT_PULSE_FWHM_PS = "input_pulse_fwhm_ps"
    LENGTH_KM = "length_km"
    GRID_HALF_WIDTH_UM = "grid_half_width_um"
    GRID_POINTS = "grid_points"


class Level1BoundaryKind(StrEnum):
    INPUT = "input"
    MODEL = "model"
    STANDARD = "standard"


class Level1ParameterBoundary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    field: Level1ParameterField
    kind: Level1BoundaryKind
    label: str = Field(min_length=1)
    range_text: str = Field(min_length=1)
    depends_on: tuple[Level1ParameterField, ...]
    source_model_id: str = Field(min_length=1)


_INPUT_SOURCE_MODEL_ID: Final[str] = "level1_input_validation"
_INPUT_LABEL: Final[str] = "Valid input"
_MODEL_LABEL: Final[str] = "Ideal single-mode condition"
_STANDARD_LABEL: Final[str] = "G.652.D limit"


def _format_number(value: float) -> str:
    return format(value, ".6g")


def _input_boundary(
    field: Level1ParameterField,
    range_text: str,
    depends_on: tuple[Level1ParameterField, ...] = (),
) -> Level1ParameterBoundary:
    return Level1ParameterBoundary(
        field=field,
        kind=Level1BoundaryKind.INPUT,
        label=_INPUT_LABEL,
        range_text=range_text,
        depends_on=depends_on,
        source_model_id=_INPUT_SOURCE_MODEL_ID,
    )


def _model_boundary(
    field: Level1ParameterField,
    range_text: str,
    depends_on: tuple[Level1ParameterField, ...],
    source_model_id: str,
) -> Level1ParameterBoundary:
    return Level1ParameterBoundary(
        field=field,
        kind=Level1BoundaryKind.MODEL,
        label=_MODEL_LABEL,
        range_text=range_text,
        depends_on=depends_on,
        source_model_id=source_model_id,
    )


def _standard_boundary(
    field: Level1ParameterField,
    range_text: str,
    depends_on: tuple[Level1ParameterField, ...],
    source_model_id: str,
) -> Level1ParameterBoundary:
    return Level1ParameterBoundary(
        field=field,
        kind=Level1BoundaryKind.STANDARD,
        label=_STANDARD_LABEL,
        range_text=range_text,
        depends_on=depends_on,
        source_model_id=source_model_id,
    )


def _single_mode_bounds(
    request: Level1SimulationRequest,
    guidance: GuidanceResult,
) -> tuple[float | None, float | None]:
    numerical_aperture = guidance.numerical_aperture_dimensionless
    cutoff_v = guidance.model_manifest.mode_regime_cutoff_v_dimensionless
    wavelength_nm = request.source.wavelength_nm
    core_radius_um = request.fibre.core_radius_um

    try:
        radius_upper_um = cutoff_v * wavelength_nm / (2.0 * math.pi * 1_000.0 * numerical_aperture)
    except (ArithmeticError, OverflowError):
        radius_upper_um = None
    try:
        wavelength_lower_nm = (
            2.0 * math.pi * 1_000.0 * numerical_aperture * core_radius_um / cutoff_v
        )
    except (ArithmeticError, OverflowError):
        wavelength_lower_nm = None

    if radius_upper_um is not None and (
        not math.isfinite(radius_upper_um) or radius_upper_um <= 0.0
    ):
        radius_upper_um = None
    if wavelength_lower_nm is not None and (
        not math.isfinite(wavelength_lower_nm) or wavelength_lower_nm <= 0.0
    ):
        wavelength_lower_nm = None
    return radius_upper_um, wavelength_lower_nm


def build_level1_parameter_boundaries(
    request: Level1SimulationRequest,
    guidance: GuidanceResult,
    standards_checks: Level1StandardsChecks,
) -> tuple[Level1ParameterBoundary, ...]:
    fibre = request.fibre
    n_core = _format_number(fibre.n_core)
    n_cladding = _format_number(fibre.n_cladding)

    boundaries = [
        _input_boundary(
            Level1ParameterField.N_CORE,
            (f"finite and > current cladding refractive index ({n_cladding} dimensionless)"),
            (Level1ParameterField.N_CLADDING,),
        ),
        _input_boundary(
            Level1ParameterField.N_CLADDING,
            (f"finite, > 0, and < current core refractive index ({n_core} dimensionless)"),
            (Level1ParameterField.N_CORE,),
        ),
        _input_boundary(
            Level1ParameterField.CORE_RADIUS_UM,
            "finite and > 0 µm",
        ),
        _input_boundary(
            Level1ParameterField.MODE_FIELD_RADIUS_UM,
            "finite and > 0 µm",
        ),
        _input_boundary(
            Level1ParameterField.ATTENUATION_DB_PER_KM,
            "finite and >= 0 dB/km",
        ),
        _input_boundary(
            Level1ParameterField.DISPERSION_PS_PER_NM_KM,
            "finite ps/(nm·km)",
        ),
        _input_boundary(
            Level1ParameterField.GROUP_INDEX_DIMENSIONLESS,
            "finite and > 0 dimensionless",
        ),
        _input_boundary(
            Level1ParameterField.WAVELENGTH_NM,
            "finite and > 0 nm",
        ),
        _input_boundary(
            Level1ParameterField.INPUT_POWER_DBM,
            "finite dBm",
        ),
        _input_boundary(
            Level1ParameterField.SPECTRAL_WIDTH_FWHM_NM,
            "finite and >= 0 nm (FWHM)",
        ),
        _input_boundary(
            Level1ParameterField.INPUT_PULSE_FWHM_PS,
            "finite and > 0 ps (FWHM)",
        ),
        _input_boundary(
            Level1ParameterField.LENGTH_KM,
            "finite and >= 0 km",
        ),
        _input_boundary(
            Level1ParameterField.GRID_HALF_WIDTH_UM,
            "finite and > 0 µm",
        ),
        _input_boundary(
            Level1ParameterField.GRID_POINTS,
            f"odd integer from {MIN_GRID_POINTS} to {MAX_GRID_POINTS} inclusive",
        ),
    ]

    radius_upper_um, wavelength_lower_nm = _single_mode_bounds(request, guidance)
    model_source_id = guidance.model_manifest.model_id
    cutoff_text = _format_number(guidance.model_manifest.mode_regime_cutoff_v_dimensionless)
    if radius_upper_um is not None:
        boundaries.append(
            _model_boundary(
                Level1ParameterField.CORE_RADIUS_UM,
                (
                    f"0 < core radius < {_format_number(radius_upper_um)} µm; "
                    f"strict upper bound for V-number < {cutoff_text}"
                ),
                (
                    Level1ParameterField.N_CORE,
                    Level1ParameterField.N_CLADDING,
                    Level1ParameterField.WAVELENGTH_NM,
                ),
                model_source_id,
            )
        )
    if wavelength_lower_nm is not None:
        boundaries.append(
            _model_boundary(
                Level1ParameterField.WAVELENGTH_NM,
                (
                    f"wavelength > {_format_number(wavelength_lower_nm)} nm; "
                    f"strict lower bound for V-number < {cutoff_text}"
                ),
                (
                    Level1ParameterField.N_CORE,
                    Level1ParameterField.N_CLADDING,
                    Level1ParameterField.CORE_RADIUS_UM,
                ),
                model_source_id,
            )
        )

    if standards_checks.preset is Level1FibrePreset.G652D:
        preset = standards_checks.preset_definition
        dispersion = standards_checks.dispersion
        attenuation = standards_checks.attenuation
        assert preset is not None
        assert dispersion is not None
        assert attenuation is not None

        boundaries.append(
            _standard_boundary(
                Level1ParameterField.WAVELENGTH_NM,
                (
                    f"{_format_number(G652D_MIN_WAVELENGTH_NM)} to "
                    f"{_format_number(G652D_MAX_WAVELENGTH_NM)} "
                    "nm inclusive"
                ),
                (),
                preset.model_id,
            )
        )
        if attenuation.maximum_attenuation_db_per_km is not None:
            boundaries.append(
                _standard_boundary(
                    Level1ParameterField.ATTENUATION_DB_PER_KM,
                    (
                        f"0 to {_format_number(attenuation.maximum_attenuation_db_per_km)} "
                        "dB/km inclusive"
                    ),
                    (Level1ParameterField.WAVELENGTH_NM,),
                    attenuation.model_manifest.model_id,
                )
            )
        boundaries.append(
            _standard_boundary(
                Level1ParameterField.DISPERSION_PS_PER_NM_KM,
                (
                    f"{_format_number(dispersion.minimum_dispersion_ps_per_nm_km)} to "
                    f"{_format_number(dispersion.maximum_dispersion_ps_per_nm_km)} "
                    "ps/(nm·km) inclusive"
                ),
                (Level1ParameterField.WAVELENGTH_NM,),
                dispersion.model_manifest.envelope_model_id,
            )
        )

    return tuple(boundaries)


__all__ = [
    "Level1BoundaryKind",
    "Level1ParameterBoundary",
    "Level1ParameterField",
    "build_level1_parameter_boundaries",
]
