import math

import pytest
from pydantic import BaseModel, ValidationError

import fibre_sim.sweeps.calculations as sweep_calculations
from fibre_sim.bends import MacrobendInput
from fibre_sim.level1 import (
    Level1FibrePreset,
    Level1SimulationRequest,
    Level1SimulationResult,
    Level1WarningCode,
    calculate_level1_simulation,
)
from fibre_sim.standards import (
    G652DAttenuationApplication,
    G652DAttenuationCheckStatus,
    G652DDispersionCheckStatus,
)
from fibre_sim.sweeps import (
    Level1SweepCalculationError,
    Level1SweepManifest,
    Level1SweepParameter,
    Level1SweepPoint,
    Level1SweepRequest,
    Level1SweepResult,
    calculate_level1_sweep,
)


def request_values(preset: Level1FibrePreset = Level1FibrePreset.CUSTOM) -> dict[str, object]:
    return {
        "preset": preset,
        "fibre": {
            "n_core": 1.47,
            "n_cladding": 1.465,
            "core_radius_um": 4.1,
            "mode_field_radius_um": 4.82,
            "attenuation_db_per_km": 0.2,
            "dispersion_ps_per_nm_km": 17.0,
            "group_index_dimensionless": 1.468,
            "cable_application": G652DAttenuationApplication.STANDARD_CABLE,
        },
        "source": {
            "wavelength_nm": 1550.0,
            "input_power_dbm": -3.0,
            "spectral_width_fwhm_nm": 0.2,
            "input_pulse_fwhm_ps": 25.0,
        },
        "section": {"length_km": 12.5},
        "sampling": {"grid_half_width_um": 15.0},
    }


def make_configuration(
    preset: Level1FibrePreset = Level1FibrePreset.CUSTOM,
    bends: tuple[MacrobendInput, ...] = (),
) -> Level1SimulationRequest:
    values = request_values(preset)
    if bends:
        section = values["section"]
        assert isinstance(section, dict)
        values["section"] = {**section, "bends": bends}
    return Level1SimulationRequest.model_validate(values)


def make_sweep(
    parameter: Level1SweepParameter = Level1SweepParameter.N_CORE,
    start_value: float = 1.47,
    stop_value: float = 1.48,
    sample_count: int = 3,
    preset: Level1FibrePreset = Level1FibrePreset.CUSTOM,
    bends: tuple[MacrobendInput, ...] = (),
) -> Level1SweepRequest:
    return Level1SweepRequest(
        base_configuration=make_configuration(preset, bends),
        parameter=parameter,
        start_value=start_value,
        stop_value=stop_value,
        sample_count=sample_count,
    )


def test_public_exports_and_parameter_values_are_exact() -> None:
    import fibre_sim.sweeps as sweeps

    assert sweeps.__all__ == [
        "Level1SweepCalculationError",
        "Level1SweepManifest",
        "Level1SweepParameter",
        "Level1SweepPoint",
        "Level1SweepRequest",
        "Level1SweepResult",
        "calculate_level1_sweep",
    ]
    assert [parameter.value for parameter in Level1SweepParameter] == [
        "n_core",
        "n_cladding",
        "core_radius_um",
        "attenuation_db_per_km",
        "dispersion_ps_per_nm_km",
        "group_index_dimensionless",
        "wavelength_nm",
        "input_power_dbm",
        "spectral_width_fwhm_nm",
        "input_pulse_fwhm_ps",
        "length_km",
    ]


@pytest.mark.parametrize(
    "model",
    [Level1SweepRequest, Level1SweepPoint, Level1SweepManifest, Level1SweepResult],
)
def test_contracts_are_frozen_and_forbid_extra_fields(model: type[BaseModel]) -> None:
    assert model.model_config["frozen"] is True
    assert model.model_config["extra"] == "forbid"


def test_request_rejects_non_strict_values_and_is_immutable() -> None:
    values: dict[str, object] = {
        "base_configuration": make_configuration(),
        "parameter": Level1SweepParameter.N_CORE,
        "start_value": "1.47",
        "stop_value": 1.48,
        "sample_count": 3,
    }
    with pytest.raises(ValidationError):
        Level1SweepRequest.model_validate(values)

    values["start_value"] = 1.47
    values["sample_count"] = True
    with pytest.raises(ValidationError):
        Level1SweepRequest.model_validate(values)

    request = make_sweep()
    with pytest.raises(ValidationError):
        Level1SweepRequest.model_validate({**request.model_dump(), "unexpected": True})
    with pytest.raises((TypeError, ValidationError)):
        request.start_value = 1.0


@pytest.mark.parametrize("start_value, stop_value", [(1.48, 1.47), (1.47, 1.47)])
def test_request_requires_strictly_increasing_bounds(start_value: float, stop_value: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_sweep(start_value=start_value, stop_value=stop_value)

    error = exc_info.value.errors()[0]
    assert error["type"] == "sweep_bounds_not_strictly_increasing"
    assert error["msg"] == "Sweep start_value must be strictly less than stop_value."


@pytest.mark.parametrize(
    ("start_value", "stop_value", "error_type", "message"),
    [
        (
            1259.0,
            1261.0,
            "invalid_start_sweep_endpoint",
            "Start sweep endpoint configuration is invalid.",
        ),
        (
            1624.0,
            1626.0,
            "invalid_stop_sweep_endpoint",
            "Stop sweep endpoint configuration is invalid.",
        ),
    ],
)
def test_g652d_endpoint_validation_identifies_invalid_endpoint(
    start_value: float,
    stop_value: float,
    error_type: str,
    message: str,
) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_sweep(
            parameter=Level1SweepParameter.WAVELENGTH_NM,
            start_value=start_value,
            stop_value=stop_value,
            preset=Level1FibrePreset.G652D,
        )

    error = exc_info.value.errors()[0]
    assert error["type"] == error_type
    assert error["msg"] == message
    expected_location = (
        ("start_value",) if error_type.startswith("invalid_start") else ("stop_value",)
    )
    assert error["loc"] == expected_location


def test_sweep_is_linearly_spaced_and_projects_only_level1_scalars() -> None:
    request = make_sweep(sample_count=5, start_value=1.47, stop_value=1.48)
    result = calculate_level1_sweep(request)

    assert result.points[0].parameter_value == 1.47
    assert result.points[-1].parameter_value == 1.48
    assert tuple(point.parameter_value for point in result.points) == (
        1.47,
        1.4725,
        1.475,
        1.4775,
        1.48,
    )
    assert result.parameter_unit == "dimensionless"
    assert result.model_manifest == Level1SweepManifest()
    assert set(Level1SweepPoint.model_fields) == {
        "parameter_value",
        "numerical_aperture_dimensionless",
        "v_number_dimensionless",
        "mode_regime",
        "approximate_mode_count",
        "section_loss_db",
        "output_power_dbm",
        "group_delay_ps",
        "dispersion_broadening_fwhm_ps",
        "output_pulse_fwhm_ps",
        "warning_codes",
        "dispersion_standard_status",
        "attenuation_standard_status",
    }
    assert "mode_profile" not in Level1SweepPoint.model_fields
    assert "configuration" not in Level1SweepPoint.model_fields


@pytest.mark.parametrize(
    ("parameter", "start_value", "stop_value"),
    [
        (Level1SweepParameter.N_CORE, 1.47, 1.48),
        (Level1SweepParameter.N_CLADDING, 1.46, 1.465),
        (Level1SweepParameter.CORE_RADIUS_UM, 4.1, 4.2),
        (Level1SweepParameter.ATTENUATION_DB_PER_KM, 0.2, 0.3),
        (Level1SweepParameter.DISPERSION_PS_PER_NM_KM, 17.0, 18.0),
        (Level1SweepParameter.GROUP_INDEX_DIMENSIONLESS, 1.468, 1.469),
        (Level1SweepParameter.WAVELENGTH_NM, 1550.0, 1560.0),
        (Level1SweepParameter.INPUT_POWER_DBM, -3.0, 0.0),
        (Level1SweepParameter.SPECTRAL_WIDTH_FWHM_NM, 0.2, 0.3),
        (Level1SweepParameter.INPUT_PULSE_FWHM_PS, 25.0, 30.0),
        (Level1SweepParameter.LENGTH_KM, 12.5, 13.5),
    ],
)
def test_each_parameter_is_replaced_and_matches_independent_level1_scalars(
    parameter: Level1SweepParameter,
    start_value: float,
    stop_value: float,
) -> None:
    request = make_sweep(parameter, start_value, stop_value, sample_count=2)
    result = calculate_level1_sweep(request)
    expected_request_values = request_values()
    nested_field = {
        Level1SweepParameter.N_CORE: ("fibre", "n_core"),
        Level1SweepParameter.N_CLADDING: ("fibre", "n_cladding"),
        Level1SweepParameter.CORE_RADIUS_UM: ("fibre", "core_radius_um"),
        Level1SweepParameter.ATTENUATION_DB_PER_KM: ("fibre", "attenuation_db_per_km"),
        Level1SweepParameter.DISPERSION_PS_PER_NM_KM: ("fibre", "dispersion_ps_per_nm_km"),
        Level1SweepParameter.GROUP_INDEX_DIMENSIONLESS: ("fibre", "group_index_dimensionless"),
        Level1SweepParameter.WAVELENGTH_NM: ("source", "wavelength_nm"),
        Level1SweepParameter.INPUT_POWER_DBM: ("source", "input_power_dbm"),
        Level1SweepParameter.SPECTRAL_WIDTH_FWHM_NM: ("source", "spectral_width_fwhm_nm"),
        Level1SweepParameter.INPUT_PULSE_FWHM_PS: ("source", "input_pulse_fwhm_ps"),
        Level1SweepParameter.LENGTH_KM: ("section", "length_km"),
    }[parameter]
    for point, value in zip(result.points, (start_value, stop_value), strict=True):
        nested_values = expected_request_values[nested_field[0]]
        assert isinstance(nested_values, dict)
        nested_values[nested_field[1]] = value
        expected_request = Level1SimulationRequest.model_validate(expected_request_values)
        expected = calculate_level1_simulation(expected_request)
        assert point.parameter_value == value
        assert (
            point.numerical_aperture_dimensionless
            == expected.guidance.numerical_aperture_dimensionless
        )
        assert point.v_number_dimensionless == expected.guidance.v_number_dimensionless
        assert point.mode_regime == expected.guidance.mode_regime
        assert point.approximate_mode_count == expected.guidance.approximate_mode_count
        assert point.section_loss_db == expected.attenuation.section_loss_db
        assert point.output_power_dbm == expected.bend_loss.output_power_dbm
        assert point.group_delay_ps == expected.group_delay.group_delay_ps
        assert (
            point.dispersion_broadening_fwhm_ps
            == expected.pulse_broadening.dispersion_broadening_fwhm_ps
        )
        assert point.output_pulse_fwhm_ps == expected.pulse_broadening.output_pulse_fwhm_ps
        assert point.warning_codes == tuple(warning.code for warning in expected.warnings)


def test_sweep_preserves_bends_and_publishes_final_post_bend_power() -> None:
    bends = tuple(
        MacrobendInput.model_validate(
            {
                "position_fraction": position,
                "radius_mm": 12.0,
                "angle_deg": 90.0,
                "supplied_loss_db": loss,
            }
        )
        for position, loss in ((0.2, 0.4), (0.7, 0.6))
    )
    request = make_sweep(
        parameter=Level1SweepParameter.LENGTH_KM,
        start_value=12.5,
        stop_value=13.5,
        sample_count=2,
        bends=bends,
    )

    result = calculate_level1_sweep(request)

    assert result.request.base_configuration.section.bends == bends
    for point in result.points:
        configuration = request.base_configuration.model_copy(
            update={
                "section": request.base_configuration.section.model_copy(
                    update={"length_km": point.parameter_value}
                )
            }
        )
        expected = calculate_level1_simulation(configuration)
        assert configuration.section.bends == bends
        assert point.section_loss_db == expected.attenuation.section_loss_db
        assert point.output_power_dbm == expected.bend_loss.output_power_dbm
        assert point.output_power_dbm < expected.attenuation.output_power_dbm


def test_g652d_statuses_and_warnings_are_projected() -> None:
    values = request_values(Level1FibrePreset.G652D)
    fibre_values = values["fibre"]
    assert isinstance(fibre_values, dict)
    values["fibre"] = {
        **fibre_values,
        "n_core": 2.0,
        "n_cladding": 1.0,
        "core_radius_um": 0.1,
        "dispersion_ps_per_nm_km": 0.0,
        "cable_application": G652DAttenuationApplication.SHORT_JUMPER,
    }
    request = Level1SweepRequest(
        base_configuration=Level1SimulationRequest.model_validate(values),
        parameter=Level1SweepParameter.WAVELENGTH_NM,
        start_value=1310.0,
        stop_value=1311.0,
        sample_count=2,
    )
    result = calculate_level1_sweep(request)

    for point in result.points:
        assert point.dispersion_standard_status is G652DDispersionCheckStatus.PASS
        assert point.attenuation_standard_status is G652DAttenuationCheckStatus.NOT_APPLICABLE
        assert point.warning_codes == (
            Level1WarningCode.AIR_ACCEPTANCE_ANGLE_UNAVAILABLE,
            Level1WarningCode.MODE_COUNT_UNAVAILABLE,
            Level1WarningCode.G652D_ATTENUATION_NOT_APPLICABLE,
        )


def test_nonfinite_and_sample_count_limits_are_rejected() -> None:
    for field, value in (
        ("start_value", math.nan),
        ("stop_value", math.inf),
    ):
        values = {
            "base_configuration": make_configuration(),
            "parameter": Level1SweepParameter.N_CORE,
            "start_value": 1.47,
            "stop_value": 1.48,
            "sample_count": 3,
        }
        values[field] = value
        with pytest.raises(ValidationError):
            Level1SweepRequest.model_validate(values)

    for sample_count in (1, 201):
        with pytest.raises(ValidationError):
            make_sweep(sample_count=sample_count)


def test_range_must_represent_requested_distinct_float_values() -> None:
    stop_value = math.nextafter(1.0, math.inf)

    with pytest.raises(ValidationError) as exc_info:
        make_sweep(
            parameter=Level1SweepParameter.INPUT_POWER_DBM,
            start_value=1.0,
            stop_value=stop_value,
            sample_count=3,
        )

    error = exc_info.value.errors()[0]
    assert error["type"] == "sweep_samples_not_distinct"
    assert error["msg"] == (
        "Sweep range is too narrow for sample_count distinct floating-point values."
    )


def test_calculation_failure_is_typed_contextual_and_chained(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_calculation = calculate_level1_simulation

    def fail(configuration: Level1SimulationRequest) -> Level1SimulationResult:
        if configuration.fibre.n_core > 1.47:
            raise OverflowError("forced failure")
        return original_calculation(configuration)

    monkeypatch.setattr(sweep_calculations, "calculate_level1_simulation", fail)
    request = make_sweep(sample_count=3)

    with pytest.raises(Level1SweepCalculationError) as exc_info:
        calculate_level1_sweep(request)

    error = exc_info.value
    assert error.parameter is Level1SweepParameter.N_CORE
    assert error.sample_index == 1
    assert error.parameter_value == 1.475
    assert isinstance(error.__cause__, OverflowError)


def test_unexpected_programming_error_is_not_disguised_as_calculation_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail(_: Level1SimulationRequest) -> Level1SimulationResult:
        raise RuntimeError("forced programming error")

    monkeypatch.setattr(sweep_calculations, "calculate_level1_simulation", fail)

    with pytest.raises(RuntimeError, match="forced programming error"):
        calculate_level1_sweep(make_sweep())


def test_result_requires_two_to_two_hundred_points() -> None:
    result = calculate_level1_sweep(make_sweep())
    payload = result.model_dump(mode="python")

    with pytest.raises(ValidationError):
        Level1SweepResult.model_validate({**payload, "points": payload["points"][:1]})

    point = payload["points"][0]
    with pytest.raises(ValidationError):
        Level1SweepResult.model_validate({**payload, "points": [point] * 201})
