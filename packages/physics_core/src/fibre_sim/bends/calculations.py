import math

from .request import MacrobendLossRequest
from .result import MacrobendLossManifest, MacrobendLossPoint, MacrobendLossResult


class MacrobendLossCalculationError(ValueError):
    pass


def _raise_if_non_finite(value: float) -> None:
    if not math.isfinite(value):
        raise MacrobendLossCalculationError(
            "Macrobend loss aggregation produced a non-finite result."
        )


def calculate_macrobend_loss(request: MacrobendLossRequest) -> MacrobendLossResult:
    cumulative_bend_loss_db = 0.0
    output_power_dbm = request.input_power_dbm
    bends: list[MacrobendLossPoint] = []

    for bend in request.bends:
        cumulative_bend_loss_db += bend.supplied_loss_db
        if cumulative_bend_loss_db == 0.0:
            cumulative_bend_loss_db = 0.0
        _raise_if_non_finite(cumulative_bend_loss_db)

        output_power_dbm = request.input_power_dbm - cumulative_bend_loss_db
        _raise_if_non_finite(output_power_dbm)
        bends.append(
            MacrobendLossPoint(
                position_fraction=bend.position_fraction,
                radius_mm=bend.radius_mm,
                angle_deg=bend.angle_deg,
                supplied_loss_db=bend.supplied_loss_db,
                cumulative_bend_loss_db=cumulative_bend_loss_db,
                output_power_dbm=output_power_dbm,
            )
        )

    total_bend_loss_db = cumulative_bend_loss_db
    if total_bend_loss_db == 0.0:
        total_bend_loss_db = 0.0
    _raise_if_non_finite(total_bend_loss_db)

    return MacrobendLossResult(
        input_power_dbm=request.input_power_dbm,
        total_bend_loss_db=total_bend_loss_db,
        output_power_dbm=output_power_dbm,
        bends=tuple(bends),
        model_manifest=MacrobendLossManifest(),
    )
