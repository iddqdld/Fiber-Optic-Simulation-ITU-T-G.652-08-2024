from typing import Final

from .calculations import v_number
from .request import GuidanceRequest

ASYMPTOTIC_MODE_COUNT_MIN_V: Final[float] = 10.0


class ModeCountValidityError(ValueError):
    pass


def approximate_mode_count(request: GuidanceRequest) -> float:
    v_value = v_number(request)
    if v_value < ASYMPTOTIC_MODE_COUNT_MIN_V:
        raise ModeCountValidityError(
            "V^2/2 estimate requires V >= 10.0 under the project validity policy "
            "(clearly highly multimode regime)."
        )
    return v_value**2 / 2
