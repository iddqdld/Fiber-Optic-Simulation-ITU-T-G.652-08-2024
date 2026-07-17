import math

from .request import ConstantAttenuationRequest
from .result import ConstantAttenuationManifest, ConstantAttenuationResult


class ConstantAttenuationCalculationError(ValueError):
    pass


def calculate_constant_attenuation(
    request: ConstantAttenuationRequest,
) -> ConstantAttenuationResult:
    section_loss_db = request.attenuation_db_per_km * request.length_km
    if section_loss_db == 0.0:
        section_loss_db = 0.0
    output_power_dbm = request.input_power_dbm - section_loss_db
    if not math.isfinite(section_loss_db) or not math.isfinite(output_power_dbm):
        raise ConstantAttenuationCalculationError(
            "Constant attenuation calculation produced a non-finite result."
        )
    return ConstantAttenuationResult(
        length_km=request.length_km,
        attenuation_db_per_km=request.attenuation_db_per_km,
        input_power_dbm=request.input_power_dbm,
        section_loss_db=section_loss_db,
        output_power_dbm=output_power_dbm,
        model_manifest=ConstantAttenuationManifest(),
    )
