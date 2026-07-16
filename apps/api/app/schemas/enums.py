from enum import StrEnum


class FibreStandard(StrEnum):
    G652D = "G652D"
    G652B = "G652B"
    CUSTOM = "CUSTOM"


class IndexProfile(StrEnum):
    STEP = "STEP"
    GRADED = "GRADED"
    CUSTOM = "CUSTOM"


class SourceType(StrEnum):
    CW = "CW"
    GAUSSIAN_PULSE = "GAUSSIAN_PULSE"


class ModelProvenance(StrEnum):
    CALCULATED = "calculated"
    APPROXIMATED = "approximated"
    USER_SUPPLIED = "user-supplied"
    STANDARDS_LIMIT = "standards-limit"


class WarningSeverity(StrEnum):
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"


class StandardsCheckStatus(StrEnum):
    PASS = "PASS"
    FAIL = "FAIL"
    NOT_CHECKED = "NOT_CHECKED"


class SimulationStatus(StrEnum):
    PENDING = "PENDING"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"
