import math

from .constants import VACUUM_SPEED_M_PER_S
from .request import GroupDelayRequest
from .result import GroupDelayManifest, GroupDelayResult


class GroupDelayCalculationError(ValueError):
    pass


def calculate_group_delay(request: GroupDelayRequest) -> GroupDelayResult:
    group_delay_ps = (
        request.group_index_dimensionless
        * request.length_km
        * 1_000.0
        / VACUUM_SPEED_M_PER_S
        * 1e12
    )
    if group_delay_ps == 0.0:
        group_delay_ps = 0.0
    if not math.isfinite(group_delay_ps):
        raise GroupDelayCalculationError("Group delay calculation produced a non-finite result.")
    return GroupDelayResult(
        length_km=request.length_km,
        group_index_dimensionless=request.group_index_dimensionless,
        group_delay_ps=group_delay_ps,
        model_manifest=GroupDelayManifest(),
    )
