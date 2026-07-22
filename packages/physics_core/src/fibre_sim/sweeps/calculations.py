from pydantic import ValidationError

from fibre_sim.attenuation import ConstantAttenuationCalculationError
from fibre_sim.bends import MacrobendLossCalculationError
from fibre_sim.dispersion import (
    ChromaticPulseBroadeningCalculationError,
    GroupDelayCalculationError,
)
from fibre_sim.level1 import Level1SimulationResult, calculate_level1_simulation

from .request import (
    Level1SweepParameter,
    Level1SweepRequest,
    _configuration_with_parameter,
    _linear_sample_values,
)
from .result import (
    Level1SweepManifest,
    Level1SweepPoint,
    Level1SweepResult,
    _Level1SweepParameterUnit,
)


class Level1SweepCalculationError(ValueError):
    def __init__(
        self,
        *,
        parameter: Level1SweepParameter,
        sample_index: int,
        parameter_value: float,
    ) -> None:
        self.parameter = parameter
        self.sample_index = sample_index
        self.parameter_value = parameter_value
        super().__init__(
            "Level 1 sweep calculation failed for "
            f"parameter {parameter.value!r} at sample index {sample_index} "
            f"with value {parameter_value!r}."
        )


_PARAMETER_UNITS: dict[Level1SweepParameter, _Level1SweepParameterUnit] = {
    Level1SweepParameter.N_CORE: "dimensionless",
    Level1SweepParameter.N_CLADDING: "dimensionless",
    Level1SweepParameter.CORE_RADIUS_UM: "µm",
    Level1SweepParameter.ATTENUATION_DB_PER_KM: "dB/km",
    Level1SweepParameter.DISPERSION_PS_PER_NM_KM: "ps/(nm·km)",
    Level1SweepParameter.GROUP_INDEX_DIMENSIONLESS: "dimensionless",
    Level1SweepParameter.WAVELENGTH_NM: "nm",
    Level1SweepParameter.INPUT_POWER_DBM: "dBm",
    Level1SweepParameter.SPECTRAL_WIDTH_FWHM_NM: "nm",
    Level1SweepParameter.INPUT_PULSE_FWHM_PS: "ps",
    Level1SweepParameter.LENGTH_KM: "km",
}


def _build_point(parameter_value: float, result: Level1SimulationResult) -> Level1SweepPoint:
    standards = result.standards_checks
    dispersion_status = standards.dispersion.status if standards.dispersion is not None else None
    attenuation_status = standards.attenuation.status if standards.attenuation is not None else None
    return Level1SweepPoint(
        parameter_value=parameter_value,
        numerical_aperture_dimensionless=result.guidance.numerical_aperture_dimensionless,
        v_number_dimensionless=result.guidance.v_number_dimensionless,
        mode_regime=result.guidance.mode_regime,
        approximate_mode_count=result.guidance.approximate_mode_count,
        section_loss_db=result.attenuation.section_loss_db,
        output_power_dbm=result.bend_loss.output_power_dbm,
        group_delay_ps=result.group_delay.group_delay_ps,
        dispersion_broadening_fwhm_ps=result.pulse_broadening.dispersion_broadening_fwhm_ps,
        output_pulse_fwhm_ps=result.pulse_broadening.output_pulse_fwhm_ps,
        warning_codes=tuple(warning.code for warning in result.warnings),
        dispersion_standard_status=dispersion_status,
        attenuation_standard_status=attenuation_status,
    )


def calculate_level1_sweep(request: Level1SweepRequest) -> Level1SweepResult:
    points: list[Level1SweepPoint] = []
    values = _linear_sample_values(
        request.start_value,
        request.stop_value,
        request.sample_count,
    )
    for sample_index, parameter_value in enumerate(values):
        try:
            configuration = _configuration_with_parameter(
                request.base_configuration,
                request.parameter,
                parameter_value,
            )
            result = calculate_level1_simulation(configuration)
            points.append(_build_point(parameter_value, result))
        except (
            ConstantAttenuationCalculationError,
            MacrobendLossCalculationError,
            GroupDelayCalculationError,
            ChromaticPulseBroadeningCalculationError,
            ValidationError,
            OverflowError,
        ) as error:
            raise Level1SweepCalculationError(
                parameter=request.parameter,
                sample_index=sample_index,
                parameter_value=parameter_value,
            ) from error

    return Level1SweepResult(
        request=request,
        parameter_unit=_PARAMETER_UNITS[request.parameter],
        points=tuple(points),
        model_manifest=Level1SweepManifest(),
    )


__all__ = [
    "Level1SweepCalculationError",
    "calculate_level1_sweep",
]
