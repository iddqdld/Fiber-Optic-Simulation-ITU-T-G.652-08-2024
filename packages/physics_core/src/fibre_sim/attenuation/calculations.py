import math

from .request import ConstantAttenuationRequest
from .result import ConstantAttenuationManifest, ConstantAttenuationResult

MAX_POWER_SAMPLES = 65


class ConstantAttenuationCalculationError(ValueError):
    pass


def _raise_if_non_finite(value: float) -> None:
    if not math.isfinite(value):
        raise ConstantAttenuationCalculationError(
            "Constant attenuation calculation produced a non-finite result."
        )


def _distance_samples(length_km: float) -> tuple[float, ...]:
    if length_km == 0.0:
        return (0.0,)

    samples: list[float] = []
    for index in range(MAX_POWER_SAMPLES):
        distance_km = length_km * (index / (MAX_POWER_SAMPLES - 1))
        if not samples or distance_km != samples[-1]:
            samples.append(distance_km)
    return tuple(samples)


def calculate_constant_attenuation(
    request: ConstantAttenuationRequest,
) -> ConstantAttenuationResult:
    section_loss_db = request.attenuation_db_per_km * request.length_km
    if section_loss_db == 0.0:
        section_loss_db = 0.0
    output_power_dbm = request.input_power_dbm - section_loss_db
    _raise_if_non_finite(section_loss_db)
    _raise_if_non_finite(output_power_dbm)

    distance_samples_km = _distance_samples(request.length_km)
    power_samples_dbm: list[float] = []
    for index, distance_km in enumerate(distance_samples_km):
        if index == 0:
            power_dbm = request.input_power_dbm
        elif index == len(distance_samples_km) - 1:
            power_dbm = output_power_dbm
        else:
            sample_loss_db = request.attenuation_db_per_km * distance_km
            _raise_if_non_finite(sample_loss_db)
            power_dbm = request.input_power_dbm - sample_loss_db
        _raise_if_non_finite(power_dbm)
        power_samples_dbm.append(power_dbm)

    return ConstantAttenuationResult(
        length_km=request.length_km,
        attenuation_db_per_km=request.attenuation_db_per_km,
        input_power_dbm=request.input_power_dbm,
        section_loss_db=section_loss_db,
        output_power_dbm=output_power_dbm,
        distance_samples_km=distance_samples_km,
        power_samples_dbm=tuple(power_samples_dbm),
        model_manifest=ConstantAttenuationManifest(),
    )
