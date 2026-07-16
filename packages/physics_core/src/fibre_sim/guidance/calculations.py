from math import asin, degrees, sqrt

from .request import GuidanceRequest


class AirAcceptanceAngleError(ValueError):
    pass


def critical_angle_deg(request: GuidanceRequest) -> float:
    return degrees(asin(request.n_cladding / request.n_core))


def numerical_aperture(request: GuidanceRequest) -> float:
    return sqrt((request.n_core - request.n_cladding) * (request.n_core + request.n_cladding))


def air_acceptance_angle_deg(request: GuidanceRequest) -> float:
    numerical_aperture_value = numerical_aperture(request)
    if numerical_aperture_value > 1:
        raise AirAcceptanceAngleError(
            "Air acceptance angle is undefined when numerical aperture exceeds 1."
        )
    return degrees(asin(numerical_aperture_value))


def relative_index_difference(request: GuidanceRequest) -> float:
    return (request.n_core - request.n_cladding) / request.n_core
