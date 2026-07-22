import math

import pytest
from pydantic import BaseModel, ValidationError

from fibre_sim.bends import MAX_MACROBENDS, MacrobendInput
from fibre_sim.level1 import (
    Level1FibreConfig,
    Level1FibrePreset,
    Level1SamplingConfig,
    Level1SectionConfig,
    Level1SimulationRequest,
    Level1SourceConfig,
    Level1StandardsChecks,
)
from fibre_sim.modes import DEFAULT_GRID_POINTS, MAX_GRID_POINTS, MIN_GRID_POINTS
from fibre_sim.standards import G652DAttenuationApplication, G652DPreset


def application() -> G652DAttenuationApplication:
    return G652DAttenuationApplication.STANDARD_CABLE


def fibre_values() -> dict[str, object]:
    return {
        "n_core": 1.47,
        "n_cladding": 1.465,
        "core_radius_um": 4.1,
        "mode_field_radius_um": 4.82,
        "attenuation_db_per_km": 0.2,
        "dispersion_ps_per_nm_km": 17.0,
        "group_index_dimensionless": 1.468,
        "cable_application": application(),
    }


def source_values() -> dict[str, object]:
    return {
        "wavelength_nm": 1550.0,
        "input_power_dbm": -3.0,
        "spectral_width_fwhm_nm": 0.2,
        "input_pulse_fwhm_ps": 25.0,
    }


def bend_values(
    position_fraction: float = 0.25,
    supplied_loss_db: float = 0.4,
) -> dict[str, object]:
    return {
        "position_fraction": position_fraction,
        "radius_mm": 12.0,
        "angle_deg": 90.0,
        "supplied_loss_db": supplied_loss_db,
    }


def request_values(preset: Level1FibrePreset = Level1FibrePreset.CUSTOM) -> dict[str, object]:
    return {
        "preset": preset,
        "fibre": fibre_values(),
        "source": source_values(),
        "section": {"length_km": 12.5},
        "sampling": {"grid_half_width_um": 15.0},
    }


def test_nested_request_has_exact_order_and_existing_sampling_defaults() -> None:
    request = Level1SimulationRequest.model_validate(request_values())

    assert list(Level1SimulationRequest.model_fields) == [
        "preset",
        "fibre",
        "source",
        "section",
        "sampling",
    ]
    assert request.sampling.grid_points == DEFAULT_GRID_POINTS
    assert MIN_GRID_POINTS <= request.sampling.grid_points <= MAX_GRID_POINTS
    assert request.section.bends == ()
    assert list(Level1SectionConfig.model_fields) == ["length_km", "bends"]


def test_section_accepts_multiple_bends_in_propagation_order() -> None:
    bends = tuple(
        MacrobendInput.model_validate(bend_values(position_fraction=position))
        for position in (0.1, 0.5, 0.9)
    )

    section = Level1SectionConfig(length_km=12.5, bends=bends)

    assert section.bends == bends
    assert tuple(bend.position_fraction for bend in section.bends) == (0.1, 0.5, 0.9)


def test_section_rejects_non_increasing_bend_positions() -> None:
    with pytest.raises(ValidationError) as exc_info:
        Level1SectionConfig(
            length_km=12.5,
            bends=(
                MacrobendInput.model_validate(bend_values(position_fraction=0.5)),
                MacrobendInput.model_validate(bend_values(position_fraction=0.5)),
            ),
        )

    error = exc_info.value.errors()[0]
    assert error["type"] == "bend_positions_not_strictly_increasing"
    assert error["msg"] == "Macrobend positions must be strictly increasing in propagation order."


def test_section_rejects_more_than_maximum_macrobends() -> None:
    bends = tuple(
        MacrobendInput.model_validate(bend_values(position_fraction=index / (MAX_MACROBENDS + 1)))
        for index in range(1, MAX_MACROBENDS + 2)
    )

    with pytest.raises(ValidationError) as exc_info:
        Level1SectionConfig(length_km=12.5, bends=bends)

    error = exc_info.value.errors()[0]
    assert error["loc"] == ("bends",)
    assert error["type"] == "too_long"


@pytest.mark.parametrize("wavelength_nm", [1260.0, 1625.0])
def test_g652d_wavelength_domain_is_inclusive(wavelength_nm: float) -> None:
    values = request_values(Level1FibrePreset.G652D)
    values["source"] = {**source_values(), "wavelength_nm": wavelength_nm}

    request = Level1SimulationRequest.model_validate(values)

    assert request.source.wavelength_nm == wavelength_nm


def test_custom_wavelength_is_positive_without_g652d_domain_limit() -> None:
    values = request_values()
    values["source"] = {**source_values(), "wavelength_nm": 1.0}

    assert Level1SimulationRequest.model_validate(values).source.wavelength_nm == 1.0


def test_g652d_wavelength_domain_error_is_stable() -> None:
    values = request_values(Level1FibrePreset.G652D)
    values["source"] = {**source_values(), "wavelength_nm": 1259.999}

    with pytest.raises(ValidationError) as exc_info:
        Level1SimulationRequest.model_validate(values)

    error = exc_info.value.errors()[0]
    assert error["type"] == "g652d_wavelength_outside_preset_domain"
    assert error["msg"] == (
        "G.652.D preset wavelength must be between 1260 nm and 1625 nm inclusive."
    )


def test_refractive_index_order_uses_guidance_error_contract() -> None:
    values = request_values()
    values["fibre"] = {**fibre_values(), "n_core": 1.465}

    with pytest.raises(ValidationError) as exc_info:
        Level1SimulationRequest.model_validate(values)

    error = exc_info.value.errors()[0]
    assert error["type"] == "invalid_refractive_index_order"
    assert error["msg"] == "Core refractive index must be greater than cladding refractive index."


@pytest.mark.parametrize("grid_points", [4, 64])
def test_sampling_grid_points_reuse_odd_validator(grid_points: int) -> None:
    with pytest.raises(ValidationError) as exc_info:
        Level1SamplingConfig(grid_half_width_um=15.0, grid_points=grid_points)

    error = exc_info.value.errors()[0]
    assert error["type"] == "grid_points_must_be_odd"
    assert error["msg"] == "Grid points must be odd so the sampling grid contains the origin."


@pytest.mark.parametrize(
    ("model", "field", "value"),
    [
        (Level1FibreConfig, "n_core", math.nan),
        (Level1SourceConfig, "wavelength_nm", math.inf),
        (Level1SectionConfig, "length_km", -1.0),
        (Level1SamplingConfig, "grid_half_width_um", 0.0),
    ],
)
def test_nested_configs_enforce_finite_and_range_constraints(
    model: type[BaseModel], field: str, value: float
) -> None:
    values: dict[str, object]
    if model is Level1FibreConfig:
        values = fibre_values()
    elif model is Level1SourceConfig:
        values = source_values()
    elif model is Level1SectionConfig:
        values = {"length_km": 1.0}
    else:
        values = {"grid_half_width_um": 15.0}
    values[field] = value

    with pytest.raises(ValidationError):
        model(**values)


def test_request_is_frozen_and_rejects_extra_fields() -> None:
    values = request_values()
    values["unexpected"] = True

    with pytest.raises(ValidationError) as exc_info:
        Level1SimulationRequest.model_validate(values)
    assert exc_info.value.errors()[0]["type"] == "extra_forbidden"

    request = Level1SimulationRequest.model_validate(request_values())
    with pytest.raises(ValidationError) as exc_info:
        request.preset = Level1FibrePreset.G652D
    assert exc_info.value.errors()[0]["type"] == "frozen_instance"


def test_standards_checks_reject_details_for_custom_preset() -> None:
    with pytest.raises(ValidationError) as exc_info:
        Level1StandardsChecks(
            preset=Level1FibrePreset.CUSTOM,
            preset_definition=G652DPreset(),
            dispersion=None,
            attenuation=None,
        )

    assert exc_info.value.errors()[0]["type"] == "custom_preset_standards_checks_must_be_none"


def test_standards_checks_require_all_details_for_g652d_preset() -> None:
    with pytest.raises(ValidationError) as exc_info:
        Level1StandardsChecks(
            preset=Level1FibrePreset.G652D,
            preset_definition=None,
            dispersion=None,
            attenuation=None,
        )

    assert exc_info.value.errors()[0]["type"] == "g652d_preset_standards_checks_required"
