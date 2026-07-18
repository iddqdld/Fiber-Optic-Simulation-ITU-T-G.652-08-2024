import json
import math
import sys
from inspect import signature
from typing import get_type_hints

import pytest
from pydantic import ValidationError

import fibre_sim.standards as standards
import fibre_sim.standards.calculations as standards_calculations
from fibre_sim.standards import (
    G652DDispersionCheckManifest,
    G652DDispersionCheckRequest,
    G652DDispersionCheckResult,
    G652DDispersionCheckStatus,
    G652DDispersionEnvelopeRequest,
    G652DDispersionEnvelopeResult,
    G652DDispersionFitRegion,
    calculate_g652d_dispersion_envelope,
    check_g652d_dispersion,
)

KEY_WAVELENGTHS = (1260.0, 1300.0, 1324.0, 1460.0, 1550.0, 1625.0)


def make_request(
    wavelength_nm: float, supplied_dispersion_ps_per_nm_km: float
) -> G652DDispersionCheckRequest:
    return G652DDispersionCheckRequest(
        wavelength_nm=wavelength_nm,
        supplied_dispersion_ps_per_nm_km=supplied_dispersion_ps_per_nm_km,
    )


def envelope_for(wavelength_nm: float) -> G652DDispersionEnvelopeResult:
    return calculate_g652d_dispersion_envelope(
        G652DDispersionEnvelopeRequest(wavelength_nm=wavelength_nm)
    )


def assert_positive_zero(value: float) -> None:
    assert value == 0.0
    assert math.copysign(1.0, value) == 1.0


def assert_margins_match(
    result: G652DDispersionCheckResult,
    supplied_dispersion_ps_per_nm_km: float,
    envelope: G652DDispersionEnvelopeResult,
) -> None:
    expected_lower_margin = (
        supplied_dispersion_ps_per_nm_km - envelope.minimum_dispersion_ps_per_nm_km
    )
    expected_upper_margin = (
        envelope.maximum_dispersion_ps_per_nm_km - supplied_dispersion_ps_per_nm_km
    )

    assert result.margin_above_minimum_ps_per_nm_km == expected_lower_margin
    assert result.margin_below_maximum_ps_per_nm_km == expected_upper_margin
    if expected_lower_margin == 0.0:
        assert_positive_zero(result.margin_above_minimum_ps_per_nm_km)
    if expected_upper_margin == 0.0:
        assert_positive_zero(result.margin_below_maximum_ps_per_nm_km)


def assert_result_matches_envelope(
    request: G652DDispersionCheckRequest,
    result: G652DDispersionCheckResult,
    envelope: G652DDispersionEnvelopeResult,
) -> None:
    assert type(result) is G652DDispersionCheckResult
    assert result.wavelength_nm == request.wavelength_nm == envelope.wavelength_nm
    assert result.supplied_dispersion_ps_per_nm_km == request.supplied_dispersion_ps_per_nm_km
    assert result.fit_region is envelope.fit_region
    assert result.minimum_dispersion_ps_per_nm_km == envelope.minimum_dispersion_ps_per_nm_km
    assert result.maximum_dispersion_ps_per_nm_km == envelope.maximum_dispersion_ps_per_nm_km
    assert_margins_match(result, request.supplied_dispersion_ps_per_nm_km, envelope)


def test_public_check_export_has_exact_signature_and_no_error_type() -> None:
    assert "check_g652d_dispersion" in standards.__all__
    assert standards.check_g652d_dispersion is check_g652d_dispersion
    assert not any(name.endswith("CalculationError") for name in standards.__all__)
    assert not hasattr(standards, "G652DDispersionCheckCalculationError")

    function_signature = signature(check_g652d_dispersion)
    assert list(function_signature.parameters) == ["request"]
    assert function_signature.parameters["request"].kind is (
        function_signature.parameters["request"].POSITIONAL_OR_KEYWORD
    )
    assert function_signature.parameters["request"].default is function_signature.empty
    assert get_type_hints(check_g652d_dispersion) == {
        "request": G652DDispersionCheckRequest,
        "return": G652DDispersionCheckResult,
    }


def test_normal_1550_vector_has_exact_result_and_fresh_default_manifest() -> None:
    request = make_request(1550.0, 17.0)

    result = check_g652d_dispersion(request)

    expected = G652DDispersionCheckResult(
        wavelength_nm=1550.0,
        supplied_dispersion_ps_per_nm_km=17.0,
        fit_region=G652DDispersionFitRegion.LINEAR,
        minimum_dispersion_ps_per_nm_km=13.305,
        maximum_dispersion_ps_per_nm_km=18.592,
        margin_above_minimum_ps_per_nm_km=17.0 - 13.305,
        margin_below_maximum_ps_per_nm_km=18.592 - 17.0,
        status=G652DDispersionCheckStatus.PASS,
        model_manifest=G652DDispersionCheckManifest(),
    )

    assert result == expected
    assert type(result.model_manifest) is G652DDispersionCheckManifest
    assert result.model_manifest == G652DDispersionCheckManifest()


@pytest.mark.parametrize("wavelength_nm", KEY_WAVELENGTHS)
def test_check_carries_exact_bounds_and_fit_region_from_independent_envelope(
    wavelength_nm: float,
) -> None:
    envelope = envelope_for(wavelength_nm)
    supplied = (
        envelope.minimum_dispersion_ps_per_nm_km + envelope.maximum_dispersion_ps_per_nm_km
    ) / 2.0
    request = make_request(wavelength_nm, supplied)

    result = check_g652d_dispersion(request)

    assert_result_matches_envelope(request, result, envelope)
    assert result.status is G652DDispersionCheckStatus.PASS


@pytest.mark.parametrize("wavelength_nm", KEY_WAVELENGTHS)
@pytest.mark.parametrize("boundary", ["minimum", "maximum"])
def test_exact_minimum_and_maximum_boundaries_pass_inclusively(
    wavelength_nm: float, boundary: str
) -> None:
    envelope = envelope_for(wavelength_nm)
    supplied = getattr(envelope, f"{boundary}_dispersion_ps_per_nm_km")
    request = make_request(wavelength_nm, supplied)

    result = check_g652d_dispersion(request)

    assert_result_matches_envelope(request, result, envelope)
    assert result.status is G652DDispersionCheckStatus.PASS
    assert result.margin_above_minimum_ps_per_nm_km >= 0.0
    assert result.margin_below_maximum_ps_per_nm_km >= 0.0


@pytest.mark.parametrize("wavelength_nm", KEY_WAVELENGTHS)
@pytest.mark.parametrize(
    ("boundary", "direction", "status"),
    [
        (
            "minimum",
            -math.inf,
            G652DDispersionCheckStatus.FAIL_BELOW_MINIMUM,
        ),
        (
            "maximum",
            math.inf,
            G652DDispersionCheckStatus.FAIL_ABOVE_MAXIMUM,
        ),
    ],
)
def test_nextafter_each_boundary_fails_without_tolerance(
    wavelength_nm: float,
    boundary: str,
    direction: float,
    status: G652DDispersionCheckStatus,
) -> None:
    envelope = envelope_for(wavelength_nm)
    bound = getattr(envelope, f"{boundary}_dispersion_ps_per_nm_km")
    supplied = math.nextafter(bound, direction)
    request = make_request(wavelength_nm, supplied)

    result = check_g652d_dispersion(request)

    assert supplied != bound
    assert_result_matches_envelope(request, result, envelope)
    assert result.status is status
    if boundary == "minimum":
        assert result.margin_above_minimum_ps_per_nm_km < 0.0
    else:
        assert result.margin_below_maximum_ps_per_nm_km < 0.0


@pytest.mark.parametrize("wavelength_nm", KEY_WAVELENGTHS)
@pytest.mark.parametrize("fraction", [0.25, 0.5, 0.75])
def test_strictly_inside_points_pass_with_positive_margins(
    wavelength_nm: float, fraction: float
) -> None:
    envelope = envelope_for(wavelength_nm)
    supplied = envelope.minimum_dispersion_ps_per_nm_km + fraction * (
        envelope.maximum_dispersion_ps_per_nm_km - envelope.minimum_dispersion_ps_per_nm_km
    )
    request = make_request(wavelength_nm, supplied)

    result = check_g652d_dispersion(request)

    assert (
        envelope.minimum_dispersion_ps_per_nm_km
        < supplied
        < (envelope.maximum_dispersion_ps_per_nm_km)
    )
    assert_result_matches_envelope(request, result, envelope)
    assert result.status is G652DDispersionCheckStatus.PASS
    assert result.margin_above_minimum_ps_per_nm_km > 0.0
    assert result.margin_below_maximum_ps_per_nm_km > 0.0


def test_o_band_envelope_and_passing_point_are_signed_negative_values() -> None:
    envelope = envelope_for(1260.0)
    supplied = (
        envelope.minimum_dispersion_ps_per_nm_km + envelope.maximum_dispersion_ps_per_nm_km
    ) / 2.0
    request = make_request(1260.0, supplied)

    result = check_g652d_dispersion(request)

    assert envelope.minimum_dispersion_ps_per_nm_km < 0.0
    assert envelope.maximum_dispersion_ps_per_nm_km < 0.0
    assert result.supplied_dispersion_ps_per_nm_km < 0.0
    assert_result_matches_envelope(request, result, envelope)
    assert result.status is G652DDispersionCheckStatus.PASS


@pytest.mark.parametrize(
    ("wavelength_nm", "supplied_sign", "zero_bound"),
    [
        (1300.0, 1.0, "maximum"),
        (1300.0, -1.0, "maximum"),
        (1324.0, 1.0, "minimum"),
        (1324.0, -1.0, "minimum"),
    ],
)
def test_zero_dispersion_boundaries_normalize_signed_zero_margins(
    wavelength_nm: float, supplied_sign: float, zero_bound: str
) -> None:
    envelope = envelope_for(wavelength_nm)
    supplied = math.copysign(0.0, supplied_sign)
    request = make_request(wavelength_nm, supplied)

    result = check_g652d_dispersion(request)

    assert getattr(envelope, f"{zero_bound}_dispersion_ps_per_nm_km") == 0.0
    assert math.copysign(1.0, getattr(envelope, f"{zero_bound}_dispersion_ps_per_nm_km")) == 1.0
    assert result.supplied_dispersion_ps_per_nm_km == supplied
    assert math.copysign(1.0, result.supplied_dispersion_ps_per_nm_km) == supplied_sign
    assert_result_matches_envelope(request, result, envelope)
    assert result.status is G652DDispersionCheckStatus.PASS
    if zero_bound == "minimum":
        assert_positive_zero(result.margin_above_minimum_ps_per_nm_km)
    else:
        assert_positive_zero(result.margin_below_maximum_ps_per_nm_km)


@pytest.mark.parametrize("wavelength_nm", KEY_WAVELENGTHS)
@pytest.mark.parametrize(
    ("supplied_dispersion_ps_per_nm_km", "status"),
    [
        (-sys.float_info.max, G652DDispersionCheckStatus.FAIL_BELOW_MINIMUM),
        (sys.float_info.max, G652DDispersionCheckStatus.FAIL_ABOVE_MAXIMUM),
    ],
)
def test_finite_extreme_supplied_values_have_finite_formula_exact_margins(
    wavelength_nm: float,
    supplied_dispersion_ps_per_nm_km: float,
    status: G652DDispersionCheckStatus,
) -> None:
    envelope = envelope_for(wavelength_nm)
    request = make_request(wavelength_nm, supplied_dispersion_ps_per_nm_km)

    result = check_g652d_dispersion(request)

    assert_result_matches_envelope(request, result, envelope)
    assert result.status is status
    assert math.isfinite(result.margin_above_minimum_ps_per_nm_km)
    assert math.isfinite(result.margin_below_maximum_ps_per_nm_km)


def test_repeated_checks_are_deterministic_immutable_and_do_not_mutate_request() -> None:
    request = make_request(1460.0, 10.0)
    request_before = request.model_dump()

    first = check_g652d_dispersion(request)
    second = check_g652d_dispersion(request)

    assert request.model_dump() == request_before
    assert request == G652DDispersionCheckRequest.model_validate(request_before)
    assert first == second
    assert first.model_dump() == second.model_dump()
    assert first.model_dump_json() == second.model_dump_json()
    assert json.loads(first.model_dump_json()) == first.model_dump(mode="json")
    assert first.model_manifest == G652DDispersionCheckManifest()
    assert second.model_manifest == G652DDispersionCheckManifest()
    assert first.model_manifest is not second.model_manifest

    request_field = "wavelength_nm"
    result_field = "status"
    with pytest.raises(ValidationError):
        setattr(request, request_field, getattr(request, request_field))
    with pytest.raises(ValidationError):
        setattr(first, result_field, getattr(first, result_field))


def test_check_composes_through_one_envelope_request_and_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = make_request(1550.0, 17.0)
    real_calculation = calculate_g652d_dispersion_envelope
    seen_requests: list[G652DDispersionEnvelopeRequest] = []
    seen_results: list[G652DDispersionEnvelopeResult] = []

    def spy(envelope_request: G652DDispersionEnvelopeRequest) -> G652DDispersionEnvelopeResult:
        assert type(envelope_request) is G652DDispersionEnvelopeRequest
        seen_requests.append(envelope_request)
        envelope_result = real_calculation(envelope_request)
        seen_results.append(envelope_result)
        return envelope_result

    monkeypatch.setattr(
        standards_calculations,
        "calculate_g652d_dispersion_envelope",
        spy,
    )
    monkeypatch.setattr(standards, "calculate_g652d_dispersion_envelope", spy)

    result = check_g652d_dispersion(request)

    assert len(seen_requests) == 1
    assert len(seen_results) == 1
    assert seen_requests[0].model_dump() == {"wavelength_nm": request.wavelength_nm}
    assert seen_requests[0].wavelength_nm == request.wavelength_nm
    assert_result_matches_envelope(request, result, seen_results[0])


def test_check_propagates_unrelated_envelope_exceptions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def raise_unrelated_error(_: G652DDispersionEnvelopeRequest) -> G652DDispersionEnvelopeResult:
        raise RuntimeError("unrelated envelope failure")

    monkeypatch.setattr(
        standards_calculations,
        "calculate_g652d_dispersion_envelope",
        raise_unrelated_error,
    )
    monkeypatch.setattr(standards, "calculate_g652d_dispersion_envelope", raise_unrelated_error)

    with pytest.raises(RuntimeError, match="unrelated envelope failure"):
        check_g652d_dispersion(make_request(1550.0, 17.0))
