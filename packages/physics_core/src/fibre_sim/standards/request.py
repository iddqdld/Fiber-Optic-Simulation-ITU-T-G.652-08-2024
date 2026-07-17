from pydantic import BaseModel, ConfigDict, Field

from .constants import G652D_MAX_WAVELENGTH_NM, G652D_MIN_WAVELENGTH_NM


class G652DDispersionEnvelopeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    wavelength_nm: float = Field(
        ge=G652D_MIN_WAVELENGTH_NM,
        le=G652D_MAX_WAVELENGTH_NM,
        allow_inf_nan=False,
        description=(
            "Evaluation wavelength for the G.652.D chromatic-dispersion envelope "
            "in nanometres (nm)."
        ),
    )
