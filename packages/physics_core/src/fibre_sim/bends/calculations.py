import math
import sys

from scipy.special import kve  # type: ignore[import-untyped]

from fibre_sim.modes import ScalarLP01SolveError, solve_scalar_step_index_lp01

from .constants import DB_PER_NEPER_POWER
from .request import MacrobendLossRequest, MarcuseBendLossInput
from .result import (
    MacrobendLossManifest,
    MacrobendLossPoint,
    MacrobendLossResult,
    MarcuseBendLossResult,
    MarcuseModelValidity,
    PropagationConstantSource,
)

_LOG_MAX_FLOAT = math.log(sys.float_info.max)
_WEAK_GUIDANCE_RELATIVE_INDEX_LIMIT = 0.02
_WARNING_CLADDING_DIAMETERS = 100.0
_OUTSIDE_CLADDING_DIAMETERS = 10.0


class MacrobendLossCalculationError(ValueError):
    pass


def _merge_validity(
    current: MarcuseModelValidity,
    incoming: MarcuseModelValidity,
) -> MarcuseModelValidity:
    order = {
        MarcuseModelValidity.VALID: 0,
        MarcuseModelValidity.WARNING: 1,
        MarcuseModelValidity.OUTSIDE_MODEL_VALIDITY: 2,
    }
    return incoming if order[incoming] > order[current] else current


def _geometry_validity(
    bend_radius_m: float,
    cladding_radius_m: float | None,
) -> tuple[MarcuseModelValidity, tuple[str, ...]]:
    if cladding_radius_m is None:
        return (
            MarcuseModelValidity.WARNING,
            (
                "The physical cladding radius is unavailable. "
                "The bend-radius geometry validity guard is unavailable.",
            ),
        )
    cladding_diameter_m = 2.0 * cladding_radius_m
    diameter_ratio = bend_radius_m / cladding_diameter_m
    if diameter_ratio <= _OUTSIDE_CLADDING_DIAMETERS:
        return (
            MarcuseModelValidity.OUTSIDE_MODEL_VALIDITY,
            (
                "The bend radius is no more than 10 cladding diameters. "
                "The Marcuse estimate is outside its geometry validity.",
            ),
        )
    if diameter_ratio <= _WARNING_CLADDING_DIAMETERS:
        return (
            MarcuseModelValidity.WARNING,
            (
                "The bend radius is no more than 100 cladding diameters. "
                "Use the analytical estimate with care.",
            ),
        )
    return MarcuseModelValidity.VALID, ()


def _weak_guidance_warning(n_core: float, n_cladding: float) -> tuple[str, ...]:
    relative_index_difference = (n_core - n_cladding) / n_core
    if relative_index_difference <= _WEAK_GUIDANCE_RELATIVE_INDEX_LIMIT:
        return ()
    return (
        "The relative index difference is more than 0.02. "
        "The weak-guidance Marcuse assumption is reduced.",
    )


def calculate_marcuse_bend_loss(
    request: MarcuseBendLossInput,
) -> MarcuseBendLossResult:
    k0_per_m = 2.0 * math.pi / request.wavelength_m
    kappa_squared = (request.n_core * k0_per_m) ** 2 - request.beta_per_m**2
    gamma_squared = request.beta_per_m**2 - (request.n_cladding * k0_per_m) ** 2
    if kappa_squared <= 0.0 or gamma_squared <= 0.0:
        raise MacrobendLossCalculationError(
            "The propagation constant does not define a guided LP01 mode."
        )

    kappa_per_m = math.sqrt(kappa_squared)
    gamma_per_m = math.sqrt(gamma_squared)
    v_number = (
        k0_per_m * request.core_radius_m * math.sqrt(request.n_core**2 - request.n_cladding**2)
    )
    u_value = kappa_per_m * request.core_radius_m
    w_value = gamma_per_m * request.core_radius_m
    scaled_k1 = float(kve(1, w_value))
    if not math.isfinite(scaled_k1) or scaled_k1 <= 0.0:
        raise MacrobendLossCalculationError("The scaled K1 Bessel value is unavailable.")

    log_k1 = math.log(scaled_k1) - w_value
    exponential_term = (
        (2.0 / 3.0) * (gamma_per_m / request.beta_per_m) ** 2 * gamma_per_m * request.bend_radius_m
    )
    log_alpha_power_per_m = (
        0.5 * math.log(math.pi)
        + 2.0 * math.log(kappa_per_m)
        - math.log(2.0)
        - 1.5 * math.log(gamma_per_m)
        - 2.0 * math.log(v_number)
        - 0.5 * math.log(request.bend_radius_m)
        - 2.0 * log_k1
        - exponential_term
    )
    if not math.isfinite(log_alpha_power_per_m):
        raise MacrobendLossCalculationError("The Marcuse log-domain result is non-finite.")
    if log_alpha_power_per_m > _LOG_MAX_FLOAT:
        raise MacrobendLossCalculationError("The Marcuse attenuation exceeds numeric range.")

    alpha_power_per_m = math.exp(log_alpha_power_per_m)
    numerical_underflow = alpha_power_per_m == 0.0
    loss_db_per_m = DB_PER_NEPER_POWER * alpha_power_per_m
    validity, geometry_warnings = _geometry_validity(
        request.bend_radius_m,
        request.cladding_radius_m,
    )
    guidance_warnings = _weak_guidance_warning(request.n_core, request.n_cladding)
    if guidance_warnings:
        validity = _merge_validity(validity, MarcuseModelValidity.WARNING)
    warnings = geometry_warnings + guidance_warnings
    if numerical_underflow:
        warnings += (
            "The estimated loss is below floating-point representability and is reported as zero.",
        )

    return MarcuseBendLossResult(
        wavelength_m=request.wavelength_m,
        bend_radius_m=request.bend_radius_m,
        beta_per_m=request.beta_per_m,
        kappa_per_m=kappa_per_m,
        gamma_per_m=gamma_per_m,
        v_number_dimensionless=v_number,
        u_dimensionless=u_value,
        w_dimensionless=w_value,
        alpha_power_per_m=alpha_power_per_m,
        loss_db_per_m=loss_db_per_m,
        log_alpha_power_per_m=log_alpha_power_per_m,
        validity=validity,
        numerical_underflow=numerical_underflow,
        warnings=warnings,
    )


def calculate_macrobend_loss(request: MacrobendLossRequest) -> MacrobendLossResult:
    if not request.bends and request.beta_per_m is None:
        return MacrobendLossResult(
            wavelength_m=request.wavelength_m,
            core_radius_m=request.core_radius_m,
            cladding_radius_m=request.cladding_radius_m,
            n_core=request.n_core,
            n_cladding=request.n_cladding,
            beta_per_m=None,
            beta_source=None,
            input_power_dbm=request.input_power_dbm,
            total_bent_length_m=0.0,
            minimum_bend_radius_m=None,
            max_local_loss_db_per_m=0.0,
            total_bend_loss_db=0.0,
            output_power_dbm=request.input_power_dbm,
            validity=MarcuseModelValidity.VALID,
            numerical_underflow=False,
            bends=(),
            warnings=(),
            model_manifest=MacrobendLossManifest(),
        )

    if request.beta_per_m is None:
        try:
            mode = solve_scalar_step_index_lp01(
                wavelength_m=request.wavelength_m,
                core_radius_m=request.core_radius_m,
                n_core=request.n_core,
                n_cladding=request.n_cladding,
            )
        except ScalarLP01SolveError as exc:
            raise MacrobendLossCalculationError(str(exc)) from exc
        beta_per_m = mode.beta_per_m
        beta_source = PropagationConstantSource.SCALAR_STEP_INDEX_LP01
    else:
        beta_per_m = request.beta_per_m
        beta_source = PropagationConstantSource.EXISTING_EFFECTIVE_INDEX

    cumulative_loss_db = 0.0
    total_bent_length_m = 0.0
    maximum_local_loss_db_per_m = 0.0
    validity = MarcuseModelValidity.VALID
    numerical_underflow = False
    points: list[MacrobendLossPoint] = []
    aggregate_warnings = list(_weak_guidance_warning(request.n_core, request.n_cladding))
    if aggregate_warnings:
        validity = MarcuseModelValidity.WARNING

    for bend in request.bends:
        bend_radius_m = bend.radius_mm * 1e-3
        bend_length_m = bend_radius_m * math.radians(abs(bend.angle_deg))
        local = calculate_marcuse_bend_loss(
            MarcuseBendLossInput(
                wavelength_m=request.wavelength_m,
                core_radius_m=request.core_radius_m,
                cladding_radius_m=request.cladding_radius_m,
                n_core=request.n_core,
                n_cladding=request.n_cladding,
                beta_per_m=beta_per_m,
                bend_radius_m=bend_radius_m,
            )
        )
        estimated_loss_db = local.loss_db_per_m * bend_length_m
        cumulative_loss_db += estimated_loss_db
        total_bent_length_m += bend_length_m
        maximum_local_loss_db_per_m = max(maximum_local_loss_db_per_m, local.loss_db_per_m)
        validity = _merge_validity(validity, local.validity)
        numerical_underflow = numerical_underflow or local.numerical_underflow
        for warning in local.warnings:
            if warning not in aggregate_warnings:
                aggregate_warnings.append(warning)
        output_power_dbm = request.input_power_dbm - cumulative_loss_db
        values = (
            estimated_loss_db,
            cumulative_loss_db,
            total_bent_length_m,
            maximum_local_loss_db_per_m,
            output_power_dbm,
        )
        if any(not math.isfinite(value) for value in values):
            raise MacrobendLossCalculationError(
                "Macrobend loss aggregation produced a non-finite result."
            )
        points.append(
            MacrobendLossPoint(
                position_fraction=bend.position_fraction,
                radius_mm=bend.radius_mm,
                angle_deg=bend.angle_deg,
                direction=bend.direction,
                bend_length_m=bend_length_m,
                alpha_power_per_m=local.alpha_power_per_m,
                local_loss_db_per_m=local.loss_db_per_m,
                estimated_radiation_loss_db=estimated_loss_db,
                cumulative_bend_loss_db=cumulative_loss_db,
                output_power_dbm=output_power_dbm,
                validity=local.validity,
                numerical_underflow=local.numerical_underflow,
                warnings=local.warnings,
            )
        )

    if not points:
        total_bent_length_m = 0.0
        cumulative_loss_db = 0.0
        maximum_local_loss_db_per_m = 0.0
        output_power_dbm = request.input_power_dbm
        minimum_bend_radius_m = None
    else:
        output_power_dbm = points[-1].output_power_dbm
        minimum_bend_radius_m = min(point.radius_mm for point in points) * 1e-3

    return MacrobendLossResult(
        wavelength_m=request.wavelength_m,
        core_radius_m=request.core_radius_m,
        cladding_radius_m=request.cladding_radius_m,
        n_core=request.n_core,
        n_cladding=request.n_cladding,
        beta_per_m=beta_per_m,
        beta_source=beta_source,
        input_power_dbm=request.input_power_dbm,
        total_bent_length_m=total_bent_length_m,
        minimum_bend_radius_m=minimum_bend_radius_m,
        max_local_loss_db_per_m=maximum_local_loss_db_per_m,
        total_bend_loss_db=cumulative_loss_db,
        output_power_dbm=output_power_dbm,
        validity=validity,
        numerical_underflow=numerical_underflow,
        bends=tuple(points),
        warnings=tuple(aggregate_warnings),
        model_manifest=MacrobendLossManifest(),
    )
