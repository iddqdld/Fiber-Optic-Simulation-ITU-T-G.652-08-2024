import json
import math
import sys
from inspect import signature

import pytest

import fibre_sim.dispersion as dispersion
from fibre_sim.dispersion import (
    ChromaticPulseBroadeningCalculationError,
    ChromaticPulseBroadeningManifest,
    ChromaticPulseBroadeningRequest,
    ChromaticPulseBroadeningResult,
    calculate_chromatic_pulse_broadening,
)

ERROR_MESSAGE = "Chromatic pulse broadening calculation produced a non-finite result."


def make_request(
    length_km: float,
    dispersion_ps_per_nm_km: float,
    spectral_width_fwhm_nm: float,
    input_pulse_fwhm_ps: float,
) -> ChromaticPulseBroadeningRequest:
    return ChromaticPulseBroadeningRequest(
        length_km=length_km,
        dispersion_ps_per_nm_km=dispersion_ps_per_nm_km,
        spectral_width_fwhm_nm=spectral_width_fwhm_nm,
        input_pulse_fwhm_ps=input_pulse_fwhm_ps,
    )


def assert_positive_zero(value: float) -> None:
    assert value == 0.0
    assert math.copysign(1.0, value) == 1.0


def test_public_calculation_exports_are_importable() -> None:
    expected_exports = [
        "ChromaticPulseBroadeningCalculationError",
        "calculate_chromatic_pulse_broadening",
    ]

    assert all(name in dispersion.__all__ for name in expected_exports)
    assert [getattr(dispersion, name) for name in expected_exports] == [
        ChromaticPulseBroadeningCalculationError,
        calculate_chromatic_pulse_broadening,
    ]
    assert signature(calculate_chromatic_pulse_broadening).parameters.keys() == {"request"}


def test_calculation_error_is_a_value_error() -> None:
    assert issubclass(ChromaticPulseBroadeningCalculationError, ValueError)


def test_reference_vector_returns_signed_accumulation_broadening_and_quadrature_output() -> None:
    result = calculate_chromatic_pulse_broadening(make_request(12.5, -17.0, 0.4, 10.0))

    assert type(result) is ChromaticPulseBroadeningResult
    assert result.accumulated_dispersion_ps_per_nm == -212.5
    assert result.dispersion_broadening_fwhm_ps == 85.0
    assert result.output_pulse_fwhm_ps == 85.58621384311844
    assert result.output_pulse_fwhm_ps == math.hypot(10.0, 85.0)
    assert type(result.model_manifest) is ChromaticPulseBroadeningManifest
    assert result.model_manifest == ChromaticPulseBroadeningManifest()


def test_result_preserves_all_request_fields_and_uses_supplied_dispersion_only() -> None:
    request = make_request(12.5, -17.0, 0.4, 10.0)
    result = calculate_chromatic_pulse_broadening(request)

    assert result.length_km == request.length_km
    assert result.dispersion_ps_per_nm_km == request.dispersion_ps_per_nm_km
    assert result.spectral_width_fwhm_nm == request.spectral_width_fwhm_nm
    assert result.input_pulse_fwhm_ps == request.input_pulse_fwhm_ps
    assert "wavelength_nm" not in type(request).model_fields
    assert not any("g652" in name.lower() for name in type(request).model_fields)
    assert any("G.652" in limitation for limitation in result.model_manifest.limitations)


def test_positive_and_negative_dispersion_have_symmetric_widths() -> None:
    positive = calculate_chromatic_pulse_broadening(make_request(12.5, 17.0, 0.4, 10.0))
    negative = calculate_chromatic_pulse_broadening(make_request(12.5, -17.0, 0.4, 10.0))

    assert positive.accumulated_dispersion_ps_per_nm == 212.5
    assert negative.accumulated_dispersion_ps_per_nm == -212.5
    assert positive.accumulated_dispersion_ps_per_nm == -negative.accumulated_dispersion_ps_per_nm
    assert positive.dispersion_broadening_fwhm_ps == negative.dispersion_broadening_fwhm_ps
    assert positive.output_pulse_fwhm_ps == negative.output_pulse_fwhm_ps


@pytest.mark.parametrize(
    ("length_km", "dispersion_ps_per_nm_km", "spectral_width_fwhm_nm"),
    [
        (0.0, -17.0, 0.4),
        (12.5, 0.0, 0.4),
        (12.5, -17.0, 0.0),
        (-0.0, -0.0, 0.0),
    ],
)
def test_zero_factors_return_input_width_and_positive_zero_broadening(
    length_km: float,
    dispersion_ps_per_nm_km: float,
    spectral_width_fwhm_nm: float,
) -> None:
    result = calculate_chromatic_pulse_broadening(
        make_request(length_km, dispersion_ps_per_nm_km, spectral_width_fwhm_nm, 10.0)
    )

    assert_positive_zero(result.dispersion_broadening_fwhm_ps)
    assert result.output_pulse_fwhm_ps == 10.0
    assert math.isfinite(result.accumulated_dispersion_ps_per_nm)
    assert math.isfinite(result.output_pulse_fwhm_ps)


def test_broadening_is_monotonic_with_abs_dispersion_length_and_spectral_width() -> None:
    by_dispersion = [
        calculate_chromatic_pulse_broadening(make_request(2.0, value, 0.4, 10.0))
        for value in (-0.1, 0.2, -0.3)
    ]
    by_length = [
        calculate_chromatic_pulse_broadening(make_request(value, -17.0, 0.4, 10.0))
        for value in (1.0, 2.0, 3.0)
    ]
    by_spectral_width = [
        calculate_chromatic_pulse_broadening(make_request(2.0, -17.0, value, 10.0))
        for value in (0.1, 0.2, 0.3)
    ]

    for results in (by_dispersion, by_length, by_spectral_width):
        assert all(
            left.dispersion_broadening_fwhm_ps < right.dispersion_broadening_fwhm_ps
            for left, right in zip(results, results[1:], strict=False)
        )
        assert all(
            left.output_pulse_fwhm_ps < right.output_pulse_fwhm_ps
            for left, right in zip(results, results[1:], strict=False)
        )


def test_output_width_uses_fwhm_quadrature() -> None:
    result = calculate_chromatic_pulse_broadening(make_request(3.0, -2.0, 1.5, 7.0))

    assert result.dispersion_broadening_fwhm_ps == 9.0
    assert result.output_pulse_fwhm_ps == math.hypot(7.0, 9.0)
    assert result.output_pulse_fwhm_ps < (
        result.input_pulse_fwhm_ps + result.dispersion_broadening_fwhm_ps
    )


def test_reciprocal_finite_extremes_remain_finite() -> None:
    result = calculate_chromatic_pulse_broadening(make_request(1.0e308, 1.0e-308, 0.4, 10.0))

    assert math.isfinite(result.accumulated_dispersion_ps_per_nm)
    assert math.isfinite(result.dispersion_broadening_fwhm_ps)
    assert math.isfinite(result.output_pulse_fwhm_ps)
    assert result.accumulated_dispersion_ps_per_nm == pytest.approx(1.0)
    assert result.dispersion_broadening_fwhm_ps == pytest.approx(0.4)
    assert result.output_pulse_fwhm_ps == pytest.approx(math.hypot(10.0, 0.4))


def test_finite_broadening_underflow_returns_positive_zero() -> None:
    result = calculate_chromatic_pulse_broadening(
        make_request(math.nextafter(0.0, 1.0), -1.0, 0.5, 10.0)
    )

    assert result.accumulated_dispersion_ps_per_nm == -math.nextafter(0.0, 1.0)
    assert_positive_zero(result.dispersion_broadening_fwhm_ps)
    assert result.output_pulse_fwhm_ps == 10.0


def test_accumulated_underflow_returns_positive_zero_broadening() -> None:
    minimum = math.nextafter(0.0, 1.0)
    result = calculate_chromatic_pulse_broadening(make_request(minimum, -minimum, 1.0, 10.0))

    assert result.accumulated_dispersion_ps_per_nm == 0.0
    assert_positive_zero(result.dispersion_broadening_fwhm_ps)
    assert result.output_pulse_fwhm_ps == 10.0


def test_large_finite_widths_use_math_hypot_without_intermediate_square_overflow() -> None:
    half_max = sys.float_info.max / 2.0
    result = calculate_chromatic_pulse_broadening(make_request(1.0, half_max, 1.0, half_max))

    assert result.accumulated_dispersion_ps_per_nm == half_max
    assert result.dispersion_broadening_fwhm_ps == half_max
    assert math.isfinite(result.output_pulse_fwhm_ps)
    assert result.output_pulse_fwhm_ps == math.hypot(half_max, half_max)
    assert math.isinf(half_max * half_max + half_max * half_max)


def assert_calculation_error(request: ChromaticPulseBroadeningRequest) -> None:
    with pytest.raises(ChromaticPulseBroadeningCalculationError) as exc_info:
        calculate_chromatic_pulse_broadening(request)

    assert str(exc_info.value) == ERROR_MESSAGE


def test_nonfinite_accumulated_dispersion_raises_typed_error() -> None:
    request = make_request(1.0e308, 1.0e308, 0.0, 10.0)

    assert math.isinf(request.length_km * request.dispersion_ps_per_nm_km)
    assert_calculation_error(request)


def test_nonfinite_broadening_with_finite_accumulation_raises_typed_error() -> None:
    request = make_request(1.0e308, 1.0, 1.0e308, 10.0)

    accumulated = request.length_km * request.dispersion_ps_per_nm_km
    assert math.isfinite(accumulated)
    assert math.isinf(abs(accumulated) * request.spectral_width_fwhm_nm)
    assert_calculation_error(request)


def test_nonfinite_output_with_finite_accumulation_and_broadening_raises_typed_error() -> None:
    maximum = sys.float_info.max
    request = make_request(1.0, maximum, 1.0, maximum)

    accumulated = request.length_km * request.dispersion_ps_per_nm_km
    broadening = abs(accumulated) * request.spectral_width_fwhm_nm
    assert math.isfinite(accumulated)
    assert math.isfinite(broadening)
    assert math.isinf(math.hypot(request.input_pulse_fwhm_ps, broadening))
    assert_calculation_error(request)


def test_repeated_calculation_is_deterministic_and_non_mutating() -> None:
    request = make_request(12.5, -17.0, 0.4, 10.0)
    request_before = request.model_dump()

    first = calculate_chromatic_pulse_broadening(request)
    second = calculate_chromatic_pulse_broadening(request)

    assert request.model_dump() == request_before
    assert request == ChromaticPulseBroadeningRequest.model_validate(request_before)
    assert first == second
    assert first.model_dump_json() == second.model_dump_json()
    assert json.loads(first.model_dump_json()) == first.model_dump(mode="json")
