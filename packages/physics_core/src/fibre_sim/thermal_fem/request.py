from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from fibre_sim.panda_mesh import PandaMeshRequest
from fibre_sim.photoelastic.geometry import PandaGeometry
from fibre_sim.photoelastic.loads import AxialLoad, ThermalState
from fibre_sim.photoelastic.materials import PandaMaterialSet

_StrictRefinementLevel = Annotated[int, Field(strict=True, ge=0, le=2)]


class PandaThermalFemRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    geometry: PandaGeometry
    materials: PandaMaterialSet
    thermal: ThermalState
    axial_load: AxialLoad
    refinement_level: _StrictRefinementLevel = 1

    def mesh_request(self, refinement_level: int | None = None) -> PandaMeshRequest:
        level = self.refinement_level if refinement_level is None else refinement_level
        return PandaMeshRequest(geometry=self.geometry, refinement_level=level)


__all__ = ["PandaThermalFemRequest"]
