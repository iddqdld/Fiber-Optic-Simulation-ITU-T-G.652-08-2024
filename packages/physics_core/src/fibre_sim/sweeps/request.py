import math
from enum import StrEnum
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from pydantic_core import InitErrorDetails, PydanticCustomError

from fibre_sim.level1 import Level1SimulationRequest


class Level1SweepParameter(StrEnum):
    N_CORE = "n_core"
    N_CLADDING = "n_cladding"
    CORE_RADIUS_UM = "core_radius_um"
    ATTENUATION_DB_PER_KM = "attenuation_db_per_km"
    DISPERSION_PS_PER_NM_KM = "dispersion_ps_per_nm_km"
    GROUP_INDEX_DIMENSIONLESS = "group_index_dimensionless"
    WAVELENGTH_NM = "wavelength_nm"
    INPUT_POWER_DBM = "input_power_dbm"
    SPECTRAL_WIDTH_FWHM_NM = "spectral_width_fwhm_nm"
    INPUT_PULSE_FWHM_PS = "input_pulse_fwhm_ps"
    LENGTH_KM = "length_km"


_StrictFiniteFloat = Annotated[float, Field(strict=True, allow_inf_nan=False)]
_StrictSampleCount = Annotated[int, Field(strict=True, ge=2, le=200)]
_ParameterTarget = tuple[str, str]

_PARAMETER_TARGETS: dict[Level1SweepParameter, _ParameterTarget] = {
    Level1SweepParameter.N_CORE: ("fibre", "n_core"),
    Level1SweepParameter.N_CLADDING: ("fibre", "n_cladding"),
    Level1SweepParameter.CORE_RADIUS_UM: ("fibre", "core_radius_um"),
    Level1SweepParameter.ATTENUATION_DB_PER_KM: ("fibre", "attenuation_db_per_km"),
    Level1SweepParameter.DISPERSION_PS_PER_NM_KM: ("fibre", "dispersion_ps_per_nm_km"),
    Level1SweepParameter.GROUP_INDEX_DIMENSIONLESS: (
        "fibre",
        "group_index_dimensionless",
    ),
    Level1SweepParameter.WAVELENGTH_NM: ("source", "wavelength_nm"),
    Level1SweepParameter.INPUT_POWER_DBM: ("source", "input_power_dbm"),
    Level1SweepParameter.SPECTRAL_WIDTH_FWHM_NM: ("source", "spectral_width_fwhm_nm"),
    Level1SweepParameter.INPUT_PULSE_FWHM_PS: ("source", "input_pulse_fwhm_ps"),
    Level1SweepParameter.LENGTH_KM: ("section", "length_km"),
}


def _linear_sample_values(
    start_value: float, stop_value: float, sample_count: int
) -> tuple[float, ...]:
    denominator = sample_count - 1
    values: list[float] = [start_value]
    difference = stop_value - start_value

    for index in range(1, denominator):
        fraction = index / denominator
        value = start_value + difference * fraction
        if not math.isfinite(value):
            value = start_value * (1.0 - fraction) + stop_value * fraction
        values.append(value)

    values.append(stop_value)
    return tuple(values)


def _configuration_with_parameter(
    configuration: Level1SimulationRequest,
    parameter: Level1SweepParameter,
    value: float,
) -> Level1SimulationRequest:
    nested_field, field_name = _PARAMETER_TARGETS[parameter]
    payload = configuration.model_dump(mode="python")
    nested_payload = payload[nested_field]
    nested_payload[field_name] = value
    return Level1SimulationRequest.model_validate(payload)


class Level1SweepRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    base_configuration: Level1SimulationRequest
    parameter: Level1SweepParameter
    start_value: _StrictFiniteFloat = Field(
        description="First parameter value, using the unit implied by parameter."
    )
    stop_value: _StrictFiniteFloat = Field(
        description="Last parameter value, using the unit implied by parameter."
    )
    sample_count: _StrictSampleCount = Field(
        description="Number of independently evaluated parameter values."
    )

    @model_validator(mode="after")
    def validate_bounds_and_endpoint_configurations(self) -> Self:
        if self.start_value >= self.stop_value:
            raise PydanticCustomError(
                "sweep_bounds_not_strictly_increasing",
                "Sweep start_value must be strictly less than stop_value.",
            )

        endpoint_errors: list[InitErrorDetails] = []
        for endpoint_name, endpoint_value in (
            ("start", self.start_value),
            ("stop", self.stop_value),
        ):
            try:
                _configuration_with_parameter(
                    self.base_configuration,
                    self.parameter,
                    endpoint_value,
                )
            except ValidationError:
                endpoint_errors.append(
                    {
                        "type": PydanticCustomError(
                            f"invalid_{endpoint_name}_sweep_endpoint",
                            f"{endpoint_name.capitalize()} sweep endpoint configuration "
                            "is invalid.",
                        ),
                        "loc": (f"{endpoint_name}_value",),
                        "input": endpoint_value,
                    }
                )

        if endpoint_errors:
            raise ValidationError.from_exception_data(type(self).__name__, endpoint_errors)

        values = _linear_sample_values(
            self.start_value,
            self.stop_value,
            self.sample_count,
        )
        if any(
            current >= following for current, following in zip(values[:-1], values[1:], strict=True)
        ):
            raise PydanticCustomError(
                "sweep_samples_not_distinct",
                "Sweep range is too narrow for sample_count distinct floating-point values.",
            )
        return self


__all__ = ["Level1SweepParameter", "Level1SweepRequest"]
