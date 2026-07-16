from math import asin, degrees, pi, sqrt

from .request import GuidanceRequest


class AirAcceptanceAngleError(ValueError):
    pass


def critical_angle_deg(request: GuidanceRequest) -> float:
    return degrees(asin(request.n_cladding / request.n_core))


def numerical_aperture(request: GuidanceRequest) -> float:
    core_index = request.n_core
    cladding_ratio = request.n_cladding / core_index
    return core_index * sqrt(
        ((core_index - request.n_cladding) / core_index) * (1.0 + cladding_ratio)
    )


def v_number(request: GuidanceRequest) -> float:
    core_radius_m = request.core_radius_um * 1e-6
    wavelength_m = request.wavelength_nm * 1e-9
    return (2.0 * pi * core_radius_m / wavelength_m) * numerical_aperture(request)


def air_acceptance_angle_deg(request: GuidanceRequest) -> float:
    numerical_aperture_value = numerical_aperture(request)
    if numerical_aperture_value > 1:
        raise AirAcceptanceAngleError(
            "Inverse-sine air acceptance-angle model requires numerical aperture <= 1."
        )
    return degrees(asin(numerical_aperture_value))


def relative_index_difference(request: GuidanceRequest) -> float:
    return (request.n_core - request.n_cladding) / request.n_core
