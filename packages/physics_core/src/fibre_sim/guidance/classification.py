from enum import StrEnum
from typing import Final

from .calculations import v_number
from .request import GuidanceRequest

LP11_CUTOFF_V: Final[float] = 2.405


class ModeRegime(StrEnum):
    SINGLE_MODE = "single_mode"
    MULTIMODE = "multimode"


def classify_mode_regime(request: GuidanceRequest) -> ModeRegime:
    if v_number(request) < LP11_CUTOFF_V:
        return ModeRegime.SINGLE_MODE
    return ModeRegime.MULTIMODE
