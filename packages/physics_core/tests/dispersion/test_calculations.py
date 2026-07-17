import json
import math

import pytest

import fibre_sim.dispersion as dispersion
from fibre_sim.dispersion import (
    VACUUM_SPEED_M_PER_S,
    ChromaticPulseBroadeningCalculationError,
    ChromaticPulseBroadeningManifest,
    ChromaticPulseBroadeningRequest,
    ChromaticPulseBroadeningResult,
    GroupDelayCalculationError,
    GroupDelayManifest,
    GroupDelayRequest,
    GroupDelayResult,
    calculate_chromatic_pulse_broadening,
    calculate_group_delay,
)

ERROR_MESSAGE = "Group delay calculation produced a non-finite result."


def make_request(length_km: float, group_index_dimensionless: float) -> GroupDelayRequest:
    return GroupDelayRequest(
        length_km=length_km,
        group_index_dimensionless=group_index_dimensionless,
    )


def assert_positive_zero(value: float) -> None:
    assert value == 0.0
    assert math.copysign(1.0, value) == 1.0


def test_public_exports_are_exact_and_point_to_calculation_api() -> None:
    expected_exports = [
        "ChromaticPulseBroadeningCalculationError",
        "ChromaticPulseBroadeningManifest",
        "ChromaticPulseBroadeningRequest",
        "ChromaticPulseBroadeningResult",
        "GroupDelayCalculationError",
        "GroupDelayManifest",
        "GroupDelayRequest",
        "GroupDelayResult",
        "VACUUM_SPEED_M_PER_S",
        "calculate_chromatic_pulse_broadening",
        "calculate_group_delay",
    ]

    assert dispersion.__all__ == expected_exports
    assert [getattr(dispersion, name) for name in expected_exports] == [
        ChromaticPulseBroadeningCalculationError,
        ChromaticPulseBroadeningManifest,
        ChromaticPulseBroadeningRequest,
        ChromaticPulseBroadeningResult,
        GroupDelayCalculationError,
        GroupDelayManifest,
        GroupDelayRequest,
        GroupDelayResult,
        VACUUM_SPEED_M_PER_S,
        calculate_chromatic_pulse_broadening,
        calculate_group_delay,
    ]


def test_calculation_error_is_a_value_error() -> None:
    assert issubclass(GroupDelayCalculationError, ValueError)


def test_reference_vector_returns_exact_analytical_delay() -> None:
    result = calculate_group_delay(make_request(12.5, 1.4682))

    assert result.group_delay_ps == 61_217_350.57124086


def test_one_kilometre_vacuum_vector_returns_exact_analytical_delay() -> None:
    result = calculate_group_delay(make_request(1.0, 1.0))

    assert result.group_delay_ps == 3_335_640.9519815203


def test_calculation_returns_exact_result_and_manifest_types_and_propagates_inputs() -> None:
    request = make_request(12.5, 1.4682)

    result = calculate_group_delay(request)

    assert type(result) is GroupDelayResult
    assert result.length_km == request.length_km
    assert result.group_index_dimensionless == request.group_index_dimensionless
    assert type(result.model_manifest) is GroupDelayManifest
    assert result.model_manifest == GroupDelayManifest()


@pytest.mark.parametrize("length_km", [0.0, -0.0])
@pytest.mark.parametrize("group_index_dimensionless", [1.0, 1.4682, 2.0])
def test_zero_and_negative_zero_lengths_return_positive_zero_delay(
    length_km: float,
    group_index_dimensionless: float,
) -> None:
    request = make_request(length_km, group_index_dimensionless)

    result = calculate_group_delay(request)

    assert result.length_km == request.length_km
    assert result.group_index_dimensionless == request.group_index_dimensionless
    assert_positive_zero(result.group_delay_ps)


def test_finite_subnormal_calculation_underflow_returns_positive_zero() -> None:
    result = calculate_group_delay(make_request(math.nextafter(0.0, 1.0), 1.4682))

    assert_positive_zero(result.group_delay_ps)


def test_delay_is_linear_with_section_length() -> None:
    baseline = calculate_group_delay(make_request(2.5, 1.4682))
    scaled = calculate_group_delay(make_request(6.25, 1.4682))

    assert scaled.group_delay_ps == pytest.approx(
        baseline.group_delay_ps * 2.5,
        rel=1e-14,
        abs=1e-9,
    )


def test_delay_is_linear_with_group_index() -> None:
    baseline = calculate_group_delay(make_request(4.0, 1.2))
    scaled = calculate_group_delay(make_request(4.0, 1.8))

    assert scaled.group_delay_ps == pytest.approx(
        baseline.group_delay_ps * 1.5,
        rel=1e-14,
        abs=1e-9,
    )


def test_split_section_delays_are_additive() -> None:
    full = calculate_group_delay(make_request(12.0, 1.4682))
    first = calculate_group_delay(make_request(4.0, 1.4682))
    second = calculate_group_delay(make_request(8.0, 1.4682))

    assert full.group_delay_ps == pytest.approx(
        first.group_delay_ps + second.group_delay_ps,
        rel=1e-14,
        abs=1e-9,
    )


def test_medium_to_vacuum_delay_ratio_equals_group_index() -> None:
    medium = calculate_group_delay(make_request(1.0, 1.4682))
    vacuum = calculate_group_delay(make_request(1.0, 1.0))

    assert medium.group_delay_ps / vacuum.group_delay_ps == pytest.approx(
        1.4682,
        rel=1e-14,
        abs=1e-15,
    )


def test_one_kilometre_fibre_like_delay_is_a_few_microseconds() -> None:
    result = calculate_group_delay(make_request(1.0, 1.4682))

    delay_us = result.group_delay_ps / 1e6
    assert delay_us == pytest.approx(4.897388045699269, rel=1e-14, abs=1e-15)
    assert 3.0 < delay_us < 10.0


def test_reciprocal_extreme_inputs_remain_finite_near_one_kilometre_vacuum_delay() -> None:
    extreme = calculate_group_delay(make_request(1.0e308, 1.0e-308))
    vacuum = calculate_group_delay(make_request(1.0, 1.0))

    assert math.isfinite(extreme.group_delay_ps)
    assert extreme.group_delay_ps == pytest.approx(vacuum.group_delay_ps, rel=1e-14, abs=1e-9)


@pytest.mark.parametrize(
    ("length_km", "group_index_dimensionless"),
    [(1.0, 1.0), (12.5, 1.4682)],
)
def test_nonzero_successful_delay_is_finite_and_positive(
    length_km: float,
    group_index_dimensionless: float,
) -> None:
    result = calculate_group_delay(make_request(length_km, group_index_dimensionless))

    assert math.isfinite(result.group_delay_ps)
    assert result.group_delay_ps > 0.0


def test_repeated_calculation_is_equal_deterministic_and_non_mutating() -> None:
    request = make_request(12.5, 1.4682)
    request_before = request.model_dump()

    first = calculate_group_delay(request)
    second = calculate_group_delay(request)

    assert request.model_dump() == request_before
    assert request == GroupDelayRequest.model_validate(request_before)
    assert first == second
    assert first.model_dump_json() == second.model_dump_json()
    assert json.loads(first.model_dump_json()) == first.model_dump(mode="json")


@pytest.mark.parametrize(
    ("length_km", "group_index_dimensionless"),
    [(1.0e308, 1.4682), (1.0e308, 1.0e308)],
)
def test_nonfinite_delay_raises_exact_calculation_error(
    length_km: float,
    group_index_dimensionless: float,
) -> None:
    with pytest.raises(GroupDelayCalculationError) as exc_info:
        calculate_group_delay(make_request(length_km, group_index_dimensionless))

    assert str(exc_info.value) == ERROR_MESSAGE
