from typing import Annotated, Final, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

MIN_GRID_POINTS: Final[int] = 3
MAX_GRID_POINTS: Final[int] = 65
DEFAULT_GRID_POINTS: Final[int] = 65

_PositiveFiniteFloat = Annotated[float, Field(gt=0, allow_inf_nan=False)]
_GridPoints = Annotated[
    int,
    Field(strict=True, ge=MIN_GRID_POINTS, le=MAX_GRID_POINTS),
]


class GaussianModeProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    mode_field_radius_um: _PositiveFiniteFloat = Field(
        description=(
            "Gaussian 1/e field radius, and therefore the 1/e^2 intensity radius, in micrometres."
        )
    )
    grid_half_width_um: _PositiveFiniteFloat = Field(
        description="Half-width of the centered square sampling grid, in micrometres."
    )
    grid_points: _GridPoints = DEFAULT_GRID_POINTS

    @model_validator(mode="after")
    def validate_grid_points_are_odd(self) -> Self:
        if self.grid_points % 2 == 0:
            raise PydanticCustomError(
                "grid_points_must_be_odd",
                "Grid points must be odd so the sampling grid contains the origin.",
            )
        return self
