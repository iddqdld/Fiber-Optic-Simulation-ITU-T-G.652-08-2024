from pydantic import BaseModel, ConfigDict, Field


class GroupDelayRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    length_km: float = Field(
        ge=0,
        allow_inf_nan=False,
        description="Fibre-section length in kilometres (km).",
    )
    group_index_dimensionless: float = Field(
        gt=0,
        allow_inf_nan=False,
        description="Supplied dimensionless group index.",
    )
