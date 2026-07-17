import math
from typing import Final

from ..guidance.calculations import v_number
from ..guidance.request import GuidanceRequest

MODE_FIELD_RADIUS_MIN_V: Final[float] = 1.2
MODE_FIELD_RADIUS_MAX_V: Final[float] = 2.4


class ModeFieldRadiusValidityError(ValueError):
    pass


def approximate_mode_field_radius_um(request: GuidanceRequest) -> float:
    v_value = v_number(request)
    if v_value < MODE_FIELD_RADIUS_MIN_V or v_value > MODE_FIELD_RADIUS_MAX_V:
        raise ModeFieldRadiusValidityError(
            "Mode-field radius approximation requires 1.2 <= V <= 2.4 "
            "under the project validity policy."
        )
    return request.core_radius_um * (0.65 + 1.619 / math.pow(v_value, 1.5) + 2.879 / v_value**6)
