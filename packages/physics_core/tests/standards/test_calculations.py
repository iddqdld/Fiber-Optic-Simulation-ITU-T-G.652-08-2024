import json
import math
from inspect import signature
from typing import get_type_hints

import pytest

import fibre_sim.standards as standards
from fibre_sim.standards import (
    G652DDispersionEnvelopeManifest,
    G652DDispersionEnvelopeRequest,
    G652DDispersionEnvelopeResult,
    G652DDispersionFitRegion,
    calculate_g652d_dispersion_envelope,
)

ZERO_DISPERSION_MIN_NM = 1300.0
ZERO_DISPERSION_MAX_NM = 1324.0
ZERO_DISPERSION_MIN_SLOPE = 0.073
ZERO_DISPERSION_MAX_SLOPE = 0.092
TRANSITION_NM = 1460.0
LINEAR_MIN_INTERCEPT = 8.625
LINEAR_MIN_SLOPE = 0.052
LINEAR_MAX_INTERCEPT = 12.472
LINEAR_MAX_SLOPE = 0.068


def sellmeier_bound(
    wavelength_nm: float,
    zero_dispersion_nm: float,
    zero_dispersion_slope: float,
) -> float:
    return (
        wavelength_nm
        * zero_dispersion_slope
        / 4.0
        * (1.0 - (zero_dispersion_nm / wavelength_nm) ** 4)
    )


def equation_6_2a(wavelength_nm: float) -> tuple[float, float]:
    return (
        sellmeier_bound(wavelength_nm, ZERO_DISPERSION_MAX_NM, ZERO_DISPERSION_MAX_SLOPE),
        sellmeier_bound(wavelength_nm, ZERO_DISPERSION_MIN_NM, ZERO_DISPERSION_MIN_SLOPE),
    )


def equation_6_2b(wavelength_nm: float) -> tuple[float, float]:
    return (
        sellmeier_bound(wavelength_nm, ZERO_DISPERSION_MAX_NM, ZERO_DISPERSION_MAX_SLOPE),
        sellmeier_bound(wavelength_nm, ZERO_DISPERSION_MIN_NM, ZERO_DISPERSION_MAX_SLOPE),
    )


def equation_6_2c(wavelength_nm: float) -> tuple[float, float]:
    return (
        sellmeier_bound(wavelength_nm, ZERO_DISPERSION_MAX_NM, ZERO_DISPERSION_MIN_SLOPE),
        sellmeier_bound(wavelength_nm, ZERO_DISPERSION_MIN_NM, ZERO_DISPERSION_MAX_SLOPE),
    )


def equation_6_3(wavelength_nm: float) -> tuple[float, float]:
    return (
        LINEAR_MIN_INTERCEPT + LINEAR_MIN_SLOPE * (wavelength_nm - TRANSITION_NM),
        LINEAR_MAX_INTERCEPT + LINEAR_MAX_SLOPE * (wavelength_nm - TRANSITION_NM),
    )


def expected_bounds(equation: str, wavelength_nm: float) -> tuple[float, float]:
    if equation == "6-2a":
        return equation_6_2a(wavelength_nm)
    if equation == "6-2b":
        return equation_6_2b(wavelength_nm)
    if equation == "6-2c":
        return equation_6_2c(wavelength_nm)
    return equation_6_3(wavelength_nm)


def result_for(wavelength_nm: float) -> G652DDispersionEnvelopeResult:
    return calculate_g652d_dispersion_envelope(
        G652DDispersionEnvelopeRequest(wavelength_nm=wavelength_nm)
    )


def test_public_calculation_export_has_exact_signature_and_no_error_type() -> None:
    assert "calculate_g652d_dispersion_envelope" in standards.__all__
    assert standards.calculate_g652d_dispersion_envelope is calculate_g652d_dispersion_envelope
    assert not any(name.endswith("CalculationError") for name in standards.__all__)
    assert not hasattr(standards, "G652DDispersionEnvelopeCalculationError")

    function_signature = signature(calculate_g652d_dispersion_envelope)
    assert list(function_signature.parameters) == ["request"]
    assert function_signature.parameters["request"].default is function_signature.empty
    type_hints = get_type_hints(calculate_g652d_dispersion_envelope)
    assert type_hints == {
        "request": G652DDispersionEnvelopeRequest,
        "return": G652DDispersionEnvelopeResult,
    }


@pytest.mark.parametrize(
    ("wavelength_nm", "minimum", "maximum", "fit_region"),
    [
        (1260.0, -6.351993435858064, -3.0620137814091057, "sellmeier"),
        (1300.0, -2.269900637800643, +0.0, "sellmeier"),
        (1324.0, +0.0, 2.148685972038197, "sellmeier"),
        (1460.0, 8.625, 12.472, "linear"),
        (1550.0, 13.305, 18.592, "linear"),
        (1625.0, 17.205, 23.692, "linear"),
    ],
)
def test_exact_analytical_vectors(
    wavelength_nm: float,
    minimum: float,
    maximum: float,
    fit_region: str,
) -> None:
    result = result_for(wavelength_nm)

    assert result.minimum_dispersion_ps_per_nm_km == minimum
    assert result.maximum_dispersion_ps_per_nm_km == maximum
    assert (
        result.fit_region
        is {
            "sellmeier": G652DDispersionFitRegion.THREE_TERM_SELLMEIER,
            "linear": G652DDispersionFitRegion.LINEAR,
        }[fit_region]
    )


@pytest.mark.parametrize(
    ("boundary_nm", "below_equation", "at_equation", "above_equation"),
    [
        (1300.0, "6-2a", "6-2b", "6-2b"),
        (1324.0, "6-2b", "6-2c", "6-2c"),
        (1460.0, "6-2c", "6-3", "6-3"),
    ],
)
def test_nextafter_boundary_ownership_matches_independent_equations(
    boundary_nm: float,
    below_equation: str,
    at_equation: str,
    above_equation: str,
) -> None:
    cases = (
        (math.nextafter(boundary_nm, -math.inf), below_equation),
        (boundary_nm, at_equation),
        (math.nextafter(boundary_nm, math.inf), above_equation),
    )

    for wavelength_nm, equation in cases:
        result = result_for(wavelength_nm)
        minimum, maximum = expected_bounds(equation, wavelength_nm)

        assert result.minimum_dispersion_ps_per_nm_km == minimum
        assert result.maximum_dispersion_ps_per_nm_km == maximum
        assert result.fit_region is (
            G652DDispersionFitRegion.LINEAR
            if wavelength_nm >= TRANSITION_NM
            else G652DDispersionFitRegion.THREE_TERM_SELLMEIER
        )


@pytest.mark.parametrize(
    ("wavelength_nm", "field"),
    [
        (ZERO_DISPERSION_MIN_NM, "maximum_dispersion_ps_per_nm_km"),
        (ZERO_DISPERSION_MAX_NM, "minimum_dispersion_ps_per_nm_km"),
    ],
)
def test_zero_dispersion_boundary_outputs_are_positive_zero(
    wavelength_nm: float, field: str
) -> None:
    value = getattr(result_for(wavelength_nm), field)

    assert value == 0.0
    assert math.copysign(1.0, value) == 1.0


def test_result_and_manifest_have_exact_public_types() -> None:
    result = result_for(1550.0)

    assert type(result) is G652DDispersionEnvelopeResult
    assert type(result.model_manifest) is G652DDispersionEnvelopeManifest
    assert result.model_manifest == G652DDispersionEnvelopeManifest()


def test_request_wavelength_is_preserved_and_only_encoded_model_data_is_used() -> None:
    request = G652DDispersionEnvelopeRequest(wavelength_nm=1550.0)
    request_before = request.model_dump()

    result = calculate_g652d_dispersion_envelope(request)

    assert request.model_dump() == request_before
    assert result.wavelength_nm == request.wavelength_nm
    assert result.model_manifest == G652DDispersionEnvelopeManifest()
    assert (
        result.minimum_dispersion_ps_per_nm_km,
        result.maximum_dispersion_ps_per_nm_km,
    ) == equation_6_3(request.wavelength_nm)


def test_repeated_calculation_and_serialization_are_deterministic() -> None:
    request = G652DDispersionEnvelopeRequest(wavelength_nm=1460.0)

    first = calculate_g652d_dispersion_envelope(request)
    second = calculate_g652d_dispersion_envelope(request)

    assert first == second
    assert first.model_dump() == second.model_dump()
    assert first.model_dump_json() == second.model_dump_json()
    assert json.loads(first.model_dump_json()) == first.model_dump(mode="json")


def test_o_band_bounds_are_signed_negative_values() -> None:
    result = result_for(1260.0)

    assert result.minimum_dispersion_ps_per_nm_km < 0.0
    assert result.maximum_dispersion_ps_per_nm_km < 0.0
    assert result.minimum_dispersion_ps_per_nm_km == -6.351993435858064
    assert result.maximum_dispersion_ps_per_nm_km == -3.0620137814091057


def test_bounds_are_ordered_finite_and_match_the_selected_equation_on_dense_domain() -> None:
    wavelengths = [1260.0 + 0.25 * index for index in range(1461)]

    for wavelength_nm in wavelengths:
        result = result_for(wavelength_nm)
        minimum, maximum = (
            equation_6_2a(wavelength_nm)
            if wavelength_nm < ZERO_DISPERSION_MIN_NM
            else equation_6_2b(wavelength_nm)
            if wavelength_nm < ZERO_DISPERSION_MAX_NM
            else equation_6_2c(wavelength_nm)
            if wavelength_nm < TRANSITION_NM
            else equation_6_3(wavelength_nm)
        )

        assert math.isfinite(result.minimum_dispersion_ps_per_nm_km)
        assert math.isfinite(result.maximum_dispersion_ps_per_nm_km)
        assert result.minimum_dispersion_ps_per_nm_km <= (result.maximum_dispersion_ps_per_nm_km)
        assert result.fit_region is (
            G652DDispersionFitRegion.THREE_TERM_SELLMEIER
            if wavelength_nm < TRANSITION_NM
            else G652DDispersionFitRegion.LINEAR
        )
        assert result.minimum_dispersion_ps_per_nm_km == minimum
        assert result.maximum_dispersion_ps_per_nm_km == maximum


@pytest.mark.parametrize(
    ("start_nm", "end_nm"),
    [(1460.0, 1460.5), (1460.0, 1550.0), (1550.0, 1625.0)],
)
def test_linear_region_increments_use_the_encoded_slopes(start_nm: float, end_nm: float) -> None:
    start = result_for(start_nm)
    end = result_for(end_nm)

    assert start.fit_region is G652DDispersionFitRegion.LINEAR
    assert end.fit_region is G652DDispersionFitRegion.LINEAR
    minimum_increment = end.minimum_dispersion_ps_per_nm_km - (
        start.minimum_dispersion_ps_per_nm_km
    )
    maximum_increment = end.maximum_dispersion_ps_per_nm_km - (
        start.maximum_dispersion_ps_per_nm_km
    )
    assert minimum_increment == pytest.approx(
        LINEAR_MIN_SLOPE * (end_nm - start_nm), rel=0.0, abs=1e-14
    )
    assert maximum_increment == pytest.approx(
        LINEAR_MAX_SLOPE * (end_nm - start_nm), rel=0.0, abs=1e-14
    )


def test_linear_region_owns_1460_over_the_rounded_sellmeier_join() -> None:
    sellmeier_minimum, sellmeier_maximum = equation_6_2c(1460.0)
    result = result_for(1460.0)

    assert sellmeier_minimum == pytest.approx(8.624939619440791, rel=0.0, abs=1e-15)
    assert sellmeier_maximum == pytest.approx(12.472214222000579, rel=0.0, abs=1e-15)
    assert result.fit_region is G652DDispersionFitRegion.LINEAR
    assert result.minimum_dispersion_ps_per_nm_km == 8.625
    assert result.maximum_dispersion_ps_per_nm_km == 12.472
    assert result.minimum_dispersion_ps_per_nm_km != sellmeier_minimum
    assert result.maximum_dispersion_ps_per_nm_km != sellmeier_maximum
