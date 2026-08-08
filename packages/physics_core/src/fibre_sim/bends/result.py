from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from .constants import MAX_MACROBENDS
from .request import BendDirection

_PositiveFiniteFloat = Annotated[float, Field(strict=True, gt=0, allow_inf_nan=False)]
_NonNegativeFiniteFloat = Annotated[float, Field(strict=True, ge=0, allow_inf_nan=False)]
_StrictFiniteFloat = Annotated[float, Field(strict=True, allow_inf_nan=False)]


class MarcuseModelValidity(StrEnum):
    VALID = "valid"
    WARNING = "warning"
    OUTSIDE_MODEL_VALIDITY = "outside_model_validity"


class PropagationConstantSource(StrEnum):
    EXISTING_EFFECTIVE_INDEX = "existing_effective_index"
    SCALAR_STEP_INDEX_LP01 = "scalar_step_index_lp01"


class MarcuseBendLossResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model: Literal["marcuse-lp01-step-index"] = "marcuse-lp01-step-index"
    scientific_label: Literal["Estimated LP01 macrobend radiation loss — Marcuse model"] = (
        "Estimated LP01 macrobend radiation loss — Marcuse model"
    )
    wavelength_m: _PositiveFiniteFloat
    bend_radius_m: _PositiveFiniteFloat
    beta_per_m: _PositiveFiniteFloat
    kappa_per_m: _PositiveFiniteFloat
    gamma_per_m: _PositiveFiniteFloat
    v_number_dimensionless: _PositiveFiniteFloat
    u_dimensionless: _PositiveFiniteFloat
    w_dimensionless: _PositiveFiniteFloat
    alpha_power_per_m: _NonNegativeFiniteFloat
    loss_db_per_m: _NonNegativeFiniteFloat
    log_alpha_power_per_m: _StrictFiniteFloat
    validity: MarcuseModelValidity
    numerical_underflow: bool
    warnings: tuple[str, ...] = ()


class MacrobendLossPoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    position_fraction: Annotated[
        float,
        Field(strict=True, ge=0, le=1, allow_inf_nan=False),
    ]
    radius_mm: _PositiveFiniteFloat
    angle_deg: Annotated[
        float,
        Field(strict=True, gt=0, le=360, allow_inf_nan=False),
    ]
    direction: BendDirection
    bend_length_m: _PositiveFiniteFloat
    alpha_power_per_m: _NonNegativeFiniteFloat
    local_loss_db_per_m: _NonNegativeFiniteFloat
    estimated_radiation_loss_db: _NonNegativeFiniteFloat
    cumulative_bend_loss_db: _NonNegativeFiniteFloat
    output_power_dbm: _StrictFiniteFloat
    validity: MarcuseModelValidity
    numerical_underflow: bool
    warnings: tuple[str, ...] = ()


class MacrobendLossManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_id: Literal["marcuse_lp01_step_index_macrobend"] = "marcuse_lp01_step_index_macrobend"
    model_version: Literal["1.0.0"] = "1.0.0"
    scientific_label: Literal["Estimated LP01 macrobend radiation loss — Marcuse model"] = (
        "Estimated LP01 macrobend radiation loss — Marcuse model"
    )
    loss_source: Literal["calculated"] = "calculated"
    path_model: Literal["piecewise_constant_curvature"] = "piecewise_constant_curvature"
    assumptions: tuple[str, ...] = (
        "weakly guiding equivalent step-index fibre",
        "scalar LP01 mode and circular transverse index model",
        "idealized infinite or absorbing cladding treatment",
        "constant curvature within each configured bend",
    )
    limitations: tuple[str, ...] = (
        "analytical engineering estimate, not measured manufacturer bend-loss data",
        "no coating, cable jacket, microbend, or cladding-coating recoupling model",
        "no full-vector bent mode, polarization coupling, or bend stress-optic model",
        "no abrupt bend-transition mode-mismatch loss",
        "fixed-index wavelength sweeps are approximate unless wavelength-dependent "
        "indices are supplied",
        "not a G.652 compliance certificate",
    )
    references: tuple[str, ...] = (
        "D. Marcuse, JOSA 66(3), 216-220 (1976), DOI 10.1364/JOSA.66.000216",
        "D. Marcuse, JOSA 66(4), 311-320 (1976), DOI 10.1364/JOSA.66.000311",
    )


class MacrobendLossResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    wavelength_m: _PositiveFiniteFloat
    core_radius_m: _PositiveFiniteFloat
    cladding_radius_m: _PositiveFiniteFloat | None
    n_core: _PositiveFiniteFloat
    n_cladding: _PositiveFiniteFloat
    beta_per_m: _PositiveFiniteFloat | None
    beta_source: PropagationConstantSource | None
    input_power_dbm: _StrictFiniteFloat
    total_bent_length_m: _NonNegativeFiniteFloat
    minimum_bend_radius_m: _PositiveFiniteFloat | None
    max_local_loss_db_per_m: _NonNegativeFiniteFloat
    total_bend_loss_db: _NonNegativeFiniteFloat
    output_power_dbm: _StrictFiniteFloat
    validity: MarcuseModelValidity
    numerical_underflow: bool
    bends: tuple[MacrobendLossPoint, ...] = Field(max_length=MAX_MACROBENDS)
    warnings: tuple[str, ...] = ()
    model_manifest: MacrobendLossManifest

    @model_validator(mode="after")
    def validate_aggregate(self) -> Self:
        if self.output_power_dbm > self.input_power_dbm:
            raise PydanticCustomError(
                "passive_output_power_exceeds_input",
                "Passive macrobend output power cannot exceed input power.",
            )
        if not self.bends:
            if self.total_bent_length_m != 0.0 or self.total_bend_loss_db != 0.0:
                raise PydanticCustomError(
                    "straight_path_loss_not_zero",
                    "A path without configured bends requires exact zero bend length and loss.",
                )
            if self.minimum_bend_radius_m is not None:
                raise PydanticCustomError(
                    "straight_path_radius_present",
                    "A path without configured bends cannot have a minimum bend radius.",
                )
            if self.output_power_dbm != self.input_power_dbm:
                raise PydanticCustomError(
                    "straight_path_power_changed",
                    "A path without configured bends requires unchanged output power.",
                )
            return self

        if self.beta_per_m is None or self.beta_source is None:
            raise PydanticCustomError(
                "bent_path_beta_required",
                "A bent path requires a guided LP01 propagation constant.",
            )

        last_point = self.bends[-1]
        if last_point.cumulative_bend_loss_db != self.total_bend_loss_db:
            raise PydanticCustomError(
                "last_bend_total_loss_mismatch",
                "The final cumulative bend loss must equal the total bend loss.",
            )
        if last_point.output_power_dbm != self.output_power_dbm:
            raise PydanticCustomError(
                "last_bend_output_power_mismatch",
                "The final bend output power must equal the result output power.",
            )
        return self


class BendPathLossResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model: Literal["local-curvature-marcuse-lp01"] = "local-curvature-marcuse-lp01"
    total_loss_db: _NonNegativeFiniteFloat
    sampled_length_m: _NonNegativeFiniteFloat
    minimum_bend_radius_m: _PositiveFiniteFloat | None
    max_local_loss_db_per_m: _NonNegativeFiniteFloat
    convergence_error_db: _NonNegativeFiniteFloat | None = None
    sample_count: Annotated[int, Field(strict=True, ge=3)]
    validity: MarcuseModelValidity
    numerical_underflow: bool
    warnings: tuple[str, ...] = ()
