from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .constants import VACUUM_SPEED_M_PER_S


class GroupDelayManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["constant_group_index_delay"] = "constant_group_index_delay"
    model_version: Literal["1.0.0"] = "1.0.0"
    vacuum_speed_m_per_s: float = Field(
        default=VACUUM_SPEED_M_PER_S,
        gt=0,
        allow_inf_nan=False,
    )
    assumptions: tuple[str, ...] = (
        "constant supplied group index over the fibre section",
        "deterministic propagation delay for the supplied section",
        "vacuum speed of light is exact at 299792458 m/s",
    )
    limitations: tuple[str, ...] = (
        "group index is supplied rather than derived from wavelength-dependent effective index",
        "excludes chromatic pulse broadening and polarization-mode dispersion",
        "propagation group delay is distinct from differential group delay",
        "not a G.652 group-delay fit or conformance model",
    )


class GroupDelayResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    length_km: float = Field(ge=0, allow_inf_nan=False)
    group_index_dimensionless: float = Field(gt=0, allow_inf_nan=False)
    group_delay_ps: float = Field(ge=0, allow_inf_nan=False)
    model_manifest: GroupDelayManifest
