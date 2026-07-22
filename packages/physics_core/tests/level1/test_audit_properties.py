import json
import math
import sys

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from pydantic import BaseModel, ValidationError

import fibre_sim.level1.calculations as level1_calculations
from fibre_sim.attenuation import ConstantAttenuationRequest, calculate_constant_attenuation
from fibre_sim.bends import MacrobendLossRequest, calculate_macrobend_loss
from fibre_sim.dispersion import (
    ChromaticPulseBroadeningRequest,
    GroupDelayRequest,
    calculate_chromatic_pulse_broadening,
    calculate_group_delay,
)
from fibre_sim.guidance import GuidanceRequest, calculate_guidance
from fibre_sim.level1 import (
    Level1FibreConfig,
    Level1FibrePreset,
    Level1SamplingConfig,
    Level1SectionConfig,
    Level1SimulationRequest,
    Level1SimulationResult,
    Level1SourceConfig,
    Level1StandardsChecks,
    Level1WarningCode,
    calculate_level1_simulation,
)
from fibre_sim.modes import GaussianModeProfileRequest, calculate_gaussian_mode_profile
from fibre_sim.standards import (
    G652DAttenuationApplication,
    G652DAttenuationCheckRequest,
    G652DDispersionCheckRequest,
    check_g652d_attenuation,
    check_g652d_dispersion,
)
from fibre_sim.standards.constants import G652D_MAX_WAVELENGTH_NM, G652D_MIN_WAVELENGTH_NM

from .test_request import fibre_values, request_values, source_values


def make_request(preset: Level1FibrePreset = Level1FibrePreset.CUSTOM) -> Level1SimulationRequest:
    return Level1SimulationRequest.model_validate(request_values(preset))


def assert_subresults_match_standalone(result: Level1SimulationResult) -> None:
    request = result.configuration
    assert result.guidance == calculate_guidance(
        GuidanceRequest(
            n_core=request.fibre.n_core,
            n_cladding=request.fibre.n_cladding,
            core_radius_um=request.fibre.core_radius_um,
            wavelength_nm=request.source.wavelength_nm,
        )
    )
    assert result.mode_profile == calculate_gaussian_mode_profile(
        GaussianModeProfileRequest(
            mode_field_radius_um=request.fibre.mode_field_radius_um,
            grid_half_width_um=request.sampling.grid_half_width_um,
            grid_points=request.sampling.grid_points,
        )
    )
    assert result.attenuation == calculate_constant_attenuation(
        ConstantAttenuationRequest(
            length_km=request.section.length_km,
            attenuation_db_per_km=request.fibre.attenuation_db_per_km,
            input_power_dbm=request.source.input_power_dbm,
        )
    )
    assert result.bend_loss == calculate_macrobend_loss(
        MacrobendLossRequest(
            input_power_dbm=result.attenuation.output_power_dbm,
            bends=request.section.bends,
        )
    )
    assert result.group_delay == calculate_group_delay(
        GroupDelayRequest(
            length_km=request.section.length_km,
            group_index_dimensionless=request.fibre.group_index_dimensionless,
        )
    )
    assert result.pulse_broadening == calculate_chromatic_pulse_broadening(
        ChromaticPulseBroadeningRequest(
            length_km=request.section.length_km,
            dispersion_ps_per_nm_km=request.fibre.dispersion_ps_per_nm_km,
            spectral_width_fwhm_nm=request.source.spectral_width_fwhm_nm,
            input_pulse_fwhm_ps=request.source.input_pulse_fwhm_ps,
        )
    )


@pytest.mark.parametrize(
    ("preset", "wavelength_nm", "valid"),
    [
        (Level1FibrePreset.CUSTOM, math.nextafter(G652D_MIN_WAVELENGTH_NM, -math.inf), True),
        (Level1FibrePreset.CUSTOM, G652D_MIN_WAVELENGTH_NM, True),
        (Level1FibrePreset.CUSTOM, G652D_MAX_WAVELENGTH_NM, True),
        (Level1FibrePreset.CUSTOM, math.nextafter(G652D_MAX_WAVELENGTH_NM, math.inf), True),
        (Level1FibrePreset.G652D, math.nextafter(G652D_MIN_WAVELENGTH_NM, -math.inf), False),
        (Level1FibrePreset.G652D, G652D_MIN_WAVELENGTH_NM, True),
        (Level1FibrePreset.G652D, G652D_MAX_WAVELENGTH_NM, True),
        (Level1FibrePreset.G652D, math.nextafter(G652D_MAX_WAVELENGTH_NM, math.inf), False),
    ],
)
def test_preset_wavelength_semantics_own_only_the_g652d_domain(
    preset: Level1FibrePreset,
    wavelength_nm: float,
    valid: bool,
) -> None:
    values = request_values(preset)
    values["source"] = {**source_values(), "wavelength_nm": wavelength_nm}

    if valid:
        assert Level1SimulationRequest.model_validate(values).source.wavelength_nm == wavelength_nm
    else:
        with pytest.raises(ValidationError) as exc_info:
            Level1SimulationRequest.model_validate(values)
        assert exc_info.value.errors()[0]["type"] == "g652d_wavelength_outside_preset_domain"


@pytest.mark.parametrize(
    ("model", "values", "field"),
    [
        (Level1FibreConfig, fibre_values(), "n_core"),
        (Level1FibreConfig, fibre_values(), "n_cladding"),
        (Level1FibreConfig, fibre_values(), "core_radius_um"),
        (Level1FibreConfig, fibre_values(), "mode_field_radius_um"),
        (Level1FibreConfig, fibre_values(), "attenuation_db_per_km"),
        (Level1FibreConfig, fibre_values(), "dispersion_ps_per_nm_km"),
        (Level1FibreConfig, fibre_values(), "group_index_dimensionless"),
        (Level1SourceConfig, source_values(), "wavelength_nm"),
        (Level1SourceConfig, source_values(), "input_power_dbm"),
        (Level1SourceConfig, source_values(), "spectral_width_fwhm_nm"),
        (Level1SourceConfig, source_values(), "input_pulse_fwhm_ps"),
        (Level1SectionConfig, {"length_km": 1.0}, "length_km"),
        (Level1SamplingConfig, {"grid_half_width_um": 15.0}, "grid_half_width_um"),
        (Level1SamplingConfig, {"grid_half_width_um": 15.0}, "grid_points"),
    ],
)
@pytest.mark.parametrize("value", [True, "1.0"])
def test_every_nested_numeric_field_is_strict(
    model: type[BaseModel],
    values: dict[str, object],
    field: str,
    value: object,
) -> None:
    invalid_values = dict(values)
    invalid_values[field] = value

    with pytest.raises(ValidationError) as exc_info:
        model.model_validate(invalid_values)

    assert exc_info.value.errors()[0]["loc"] == (field,)


@pytest.mark.parametrize(
    ("nested_field", "field"),
    [
        ("fibre", "n_core"),
        ("source", "wavelength_nm"),
        ("section", "length_km"),
        ("sampling", "grid_half_width_um"),
    ],
)
def test_nested_request_validation_does_not_coerce_numeric_strings(
    nested_field: str,
    field: str,
) -> None:
    values = request_values()
    nested_values = values[nested_field]
    assert isinstance(nested_values, dict)
    values[nested_field] = {**nested_values, field: "1.0"}

    with pytest.raises(ValidationError) as exc_info:
        Level1SimulationRequest.model_validate(values)

    assert exc_info.value.errors()[0]["loc"] == (nested_field, field)


@pytest.mark.parametrize("nested_field", ["fibre", "source", "section", "sampling"])
def test_nested_request_models_forbid_extra_fields(nested_field: str) -> None:
    values = request_values()
    nested_values = values[nested_field]
    assert isinstance(nested_values, dict)
    values[nested_field] = {**nested_values, "unexpected": True}

    with pytest.raises(ValidationError) as exc_info:
        Level1SimulationRequest.model_validate(values)

    assert exc_info.value.errors()[0]["loc"] == (nested_field, "unexpected")


@given(
    wavelength_nm=st.floats(
        allow_nan=True,
        allow_infinity=True,
        width=64,
    ),
)
@settings(max_examples=100, derandomize=True)
def test_custom_source_wavelength_accepts_exactly_positive_finite_values(
    wavelength_nm: float,
) -> None:
    values = source_values()
    values["wavelength_nm"] = wavelength_nm

    if math.isfinite(wavelength_nm) and wavelength_nm > 0.0:
        assert Level1SourceConfig.model_validate(values).wavelength_nm == wavelength_nm
    else:
        with pytest.raises(ValidationError):
            Level1SourceConfig.model_validate(values)


@given(
    n_core=st.floats(
        min_value=math.nextafter(0.0, math.inf),
        max_value=sys.float_info.max,
        allow_nan=False,
        allow_infinity=False,
    ),
    n_cladding=st.floats(
        min_value=math.nextafter(0.0, math.inf),
        max_value=sys.float_info.max,
        allow_nan=False,
        allow_infinity=False,
    ),
)
@settings(max_examples=100, derandomize=True)
def test_refractive_index_order_is_the_only_cross_field_index_rule(
    n_core: float,
    n_cladding: float,
) -> None:
    values = fibre_values()
    values.update({"n_core": n_core, "n_cladding": n_cladding})

    if n_core > n_cladding:
        assert Level1FibreConfig.model_validate(values).n_core == n_core
    else:
        with pytest.raises(ValidationError) as exc_info:
            Level1FibreConfig.model_validate(values)
        assert exc_info.value.errors()[0]["type"] == "invalid_refractive_index_order"


@pytest.mark.parametrize("preset", [Level1FibrePreset.CUSTOM, Level1FibrePreset.G652D])
def test_each_level1_subresult_matches_its_standalone_calculation(
    preset: Level1FibrePreset,
) -> None:
    result = calculate_level1_simulation(make_request(preset))

    assert_subresults_match_standalone(result)
    if preset is Level1FibrePreset.G652D:
        request = result.configuration
        assert result.standards_checks.dispersion == check_g652d_dispersion(
            G652DDispersionCheckRequest(
                wavelength_nm=request.source.wavelength_nm,
                supplied_dispersion_ps_per_nm_km=request.fibre.dispersion_ps_per_nm_km,
            )
        )
        assert result.standards_checks.attenuation == check_g652d_attenuation(
            G652DAttenuationCheckRequest(
                wavelength_nm=request.source.wavelength_nm,
                attenuation_db_per_km=request.fibre.attenuation_db_per_km,
                cable_application=request.fibre.cable_application,
            )
        )


def test_standards_checks_require_exact_detail_presence_for_each_preset() -> None:
    result = calculate_level1_simulation(make_request(Level1FibrePreset.G652D))
    checks = result.standards_checks
    details = {
        "preset_definition": checks.preset_definition,
        "dispersion": checks.dispersion,
        "attenuation": checks.attenuation,
    }

    for missing_field in details:
        g652d_values: dict[str, object] = {"preset": Level1FibrePreset.G652D, **details}
        g652d_values[missing_field] = None
        with pytest.raises(ValidationError) as exc_info:
            Level1StandardsChecks.model_validate(g652d_values)
        assert exc_info.value.errors()[0]["type"] == "g652d_preset_standards_checks_required"

        custom_values: dict[str, object] = {
            "preset": Level1FibrePreset.CUSTOM,
            "preset_definition": None,
            "dispersion": None,
            "attenuation": None,
        }
        custom_values[missing_field] = details[missing_field]
        with pytest.raises(ValidationError) as exc_info:
            Level1StandardsChecks.model_validate(custom_values)
        assert exc_info.value.errors()[0]["type"] == "custom_preset_standards_checks_must_be_none"


def test_warning_order_and_component_order_are_stable_for_all_level1_branches() -> None:
    values = request_values(Level1FibrePreset.G652D)
    values["fibre"] = {
        **fibre_values(),
        "n_core": 2.0,
        "n_cladding": 1.0,
        "core_radius_um": 0.1,
        "cable_application": G652DAttenuationApplication.SHORT_JUMPER,
    }
    result = calculate_level1_simulation(Level1SimulationRequest.model_validate(values))
    checks = result.standards_checks

    assert [warning.code for warning in result.warnings] == [
        Level1WarningCode.AIR_ACCEPTANCE_ANGLE_UNAVAILABLE,
        Level1WarningCode.MODE_COUNT_UNAVAILABLE,
        Level1WarningCode.G652D_ATTENUATION_NOT_APPLICABLE,
    ]
    assert [warning.output_field for warning in result.warnings] == [
        "air_acceptance_angle_deg",
        "approximate_mode_count",
        "standards_checks.attenuation",
    ]
    assert checks.attenuation is not None
    assert result.warnings[-1].source_model_id == checks.attenuation.model_manifest.model_id
    assert result.model_manifest.component_model_ids == (
        "ideal_circular_step_index_guidance",
        "gaussian_lp01_mode_profile",
        "constant_fibre_attenuation",
        "user_supplied_macrobend_loss",
        "constant_group_index_delay",
        "first_order_chromatic_pulse_broadening",
        "itu_t_g652d_preset",
        "itu_t_g652d_chromatic_dispersion_envelope",
        "itu_t_g652d_chromatic_dispersion_check",
        "itu_t_g652d_attenuation_check",
    )
    assert result.model_manifest.model_version == "1.1.0"


@pytest.mark.parametrize("preset", [Level1FibrePreset.CUSTOM, Level1FibrePreset.G652D])
def test_level1_repeated_calls_and_model_json_round_trip_are_deterministic(
    preset: Level1FibrePreset,
) -> None:
    request = make_request(preset)
    first = calculate_level1_simulation(request)
    second = calculate_level1_simulation(request)

    assert first == second
    assert first.model_dump() == second.model_dump()
    assert first.model_dump_json() == second.model_dump_json()
    assert Level1SimulationResult.model_validate(first.model_dump()) == first
    assert Level1SimulationResult.model_validate_json(first.model_dump_json()) == first
    assert json.loads(first.model_dump_json()) == first.model_dump(mode="json")


def test_level1_propagates_subcalculation_exceptions(monkeypatch: pytest.MonkeyPatch) -> None:
    def raise_guidance(_: GuidanceRequest) -> None:
        raise RuntimeError("guidance failure")

    monkeypatch.setattr(level1_calculations, "calculate_guidance", raise_guidance)

    with pytest.raises(RuntimeError, match="guidance failure"):
        calculate_level1_simulation(make_request())


def test_level1_propagates_g652d_check_exceptions(monkeypatch: pytest.MonkeyPatch) -> None:
    def raise_attenuation(_: G652DAttenuationCheckRequest) -> None:
        raise RuntimeError("attenuation check failure")

    monkeypatch.setattr(level1_calculations, "check_g652d_attenuation", raise_attenuation)

    with pytest.raises(RuntimeError, match="attenuation check failure"):
        calculate_level1_simulation(make_request(Level1FibrePreset.G652D))
