from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from fibre_sim.photoelastic.geometry import PandaGeometry

_StrictRefinementLevel = Annotated[int, Field(strict=True, ge=0, le=2)]


class PandaMeshRegion(StrEnum):
    CLADDING = "cladding"
    CORE = "core"
    SAP_1 = "sap_1"
    SAP_2 = "sap_2"


class PandaMeshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    geometry: PandaGeometry
    refinement_level: _StrictRefinementLevel = 0


__all__ = ["PandaMeshRegion", "PandaMeshRequest"]
