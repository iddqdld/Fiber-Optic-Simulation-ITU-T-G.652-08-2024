import json
import math
import sys

import pytest

import fibre_sim.attenuation as attenuation
from fibre_sim.attenuation import (
    ConstantAttenuationCalculationError,
    ConstantAttenuationManifest,
    ConstantAttenuationRequest,
    ConstantAttenuationResult,
    calculate_constant_attenuation,
)

ERROR_MESSAGE = "Constant attenuation calculation produced a non-finite result."


def make_request(
    length_km: float,
    attenuation_db_per_km: float,
    input_power_dbm: float,
) -> ConstantAttenuationRequest:
    return ConstantAttenuationRequest(
        length_km=length_km,
        attenuation_db_per_km=attenuation_db_per_km,
        input_power_dbm=input_power_dbm,
    )


def assert_positive_zero(value: float) -> None:
    assert value == 0.0
    assert math.copysign(1.0, value) == 1.0


def test_public_exports_and_all_include_calculation_api() -> None:
    expected_exports = [
        "ConstantAttenuationCalculationError",
        "ConstantAttenuationManifest",
        "ConstantAttenuationRequest",
        "ConstantAttenuationResult",
        "calculate_constant_attenuation",
    ]

    assert attenuation.__all__ == expected_exports
    assert {
        name
        for name, value in vars(attenuation).items()
        if not name.startswith("_") and callable(value)
    } == set(expected_exports)
    assert [getattr(attenuation, name) for name in expected_exports] == [
        ConstantAttenuationCalculationError,
        ConstantAttenuationManifest,
        ConstantAttenuationRequest,
        ConstantAttenuationResult,
        calculate_constant_attenuation,
    ]


def test_calculation_error_is_a_value_error() -> None:
    assert issubclass(ConstantAttenuationCalculationError, ValueError)


def test_normal_analytical_vector_returns_exact_result_and_manifest() -> None:
    request = make_request(12.5, 0.2, -3.0)

    result = calculate_constant_attenuation(request)

    assert type(result) is ConstantAttenuationResult
    assert result == ConstantAttenuationResult(
        length_km=12.5,
        attenuation_db_per_km=0.2,
        input_power_dbm=-3.0,
        section_loss_db=2.5,
        output_power_dbm=-5.5,
        distance_samples_km=tuple(12.5 * (index / 64) for index in range(65)),
        power_samples_dbm=tuple(
            -3.0 if index == 0 else -5.5 if index == 64 else -3.0 - 0.2 * (12.5 * (index / 64))
            for index in range(65)
        ),
        model_manifest=ConstantAttenuationManifest(),
    )
    assert type(result.model_manifest) is ConstantAttenuationManifest
    assert result.model_manifest == ConstantAttenuationManifest()


@pytest.mark.parametrize(
    ("length_km", "attenuation_db_per_km"),
    [
        (0.0, 0.2),
        (12.5, 0.0),
        (-0.0, 0.2),
        (12.5, -0.0),
        (-0.0, -0.0),
    ],
)
def test_zero_length_or_coefficient_preserves_input_and_has_positive_zero_loss(
    length_km: float,
    attenuation_db_per_km: float,
) -> None:
    request = make_request(length_km, attenuation_db_per_km, -3.0)

    result = calculate_constant_attenuation(request)

    assert result.length_km == request.length_km
    assert result.attenuation_db_per_km == request.attenuation_db_per_km
    assert result.input_power_dbm == request.input_power_dbm
    assert_positive_zero(result.section_loss_db)
    assert result.output_power_dbm == request.input_power_dbm
    if request.length_km == 0.0:
        assert result.distance_samples_km == (0.0,)
        assert result.power_samples_dbm == (request.input_power_dbm,)
    else:
        assert len(result.distance_samples_km) == 65
        assert len(result.power_samples_dbm) == 65


@pytest.mark.parametrize("input_power_dbm", [7.5, 0.0, -7.5])
def test_zero_loss_preserves_positive_zero_and_negative_input_powers(
    input_power_dbm: float,
) -> None:
    result = calculate_constant_attenuation(make_request(4.0, 0.0, input_power_dbm))

    assert_positive_zero(result.section_loss_db)
    assert result.output_power_dbm == input_power_dbm


@pytest.mark.parametrize(
    ("length_km", "attenuation_db_per_km", "input_power_dbm", "loss", "output"),
    [
        (1.0, 0.25, 10.0, 0.25, 9.75),
        (80.0, 0.015, -20.0, 1.2, -21.2),
        (3.75, 1.6, 4.25, 6.0, -1.75),
    ],
)
def test_nonzero_reference_vectors_match_analytical_values(
    length_km: float,
    attenuation_db_per_km: float,
    input_power_dbm: float,
    loss: float,
    output: float,
) -> None:
    result = calculate_constant_attenuation(
        make_request(length_km, attenuation_db_per_km, input_power_dbm)
    )

    assert result.section_loss_db == pytest.approx(loss, rel=1e-14, abs=1e-15)
    assert result.output_power_dbm == pytest.approx(output, rel=1e-14, abs=1e-15)


def test_positive_length_returns_evenly_parameterized_finite_samples() -> None:
    result = calculate_constant_attenuation(make_request(12.5, 0.2, -3.0))

    assert len(result.distance_samples_km) == 65
    assert result.distance_samples_km[0] == 0.0
    assert result.distance_samples_km[-1] == result.length_km
    assert all(
        previous < current
        for previous, current in zip(
            result.distance_samples_km, result.distance_samples_km[1:], strict=False
        )
    )
    assert result.power_samples_dbm[0] == result.input_power_dbm
    assert result.power_samples_dbm[-1] == result.output_power_dbm
    assert all(
        previous >= current
        for previous, current in zip(
            result.power_samples_dbm, result.power_samples_dbm[1:], strict=False
        )
    )
    assert all(math.isfinite(value) for value in result.distance_samples_km)
    assert all(math.isfinite(value) for value in result.power_samples_dbm)
    for distance_km, power_dbm in zip(
        result.distance_samples_km[1:-1], result.power_samples_dbm[1:-1], strict=True
    ):
        assert power_dbm == -3.0 - (0.2 * distance_km)


def test_positive_subnormal_length_deduplicates_distance_candidates() -> None:
    length_km = math.nextafter(0.0, 1.0)

    result = calculate_constant_attenuation(make_request(length_km, 0.5, -3.25))

    assert result.distance_samples_km == (0.0, length_km)
    assert result.power_samples_dbm == (-3.25, -3.25)


def test_loss_is_additive_in_db_and_sequential_sections_match_full_section() -> None:
    coefficient = 0.23
    input_power_dbm = -4.0
    full = calculate_constant_attenuation(make_request(12.0, coefficient, input_power_dbm))
    first = calculate_constant_attenuation(make_request(4.0, coefficient, input_power_dbm))
    second = calculate_constant_attenuation(make_request(8.0, coefficient, first.output_power_dbm))

    assert full.section_loss_db == pytest.approx(
        first.section_loss_db + second.section_loss_db, rel=1e-14, abs=1e-15
    )
    assert full.output_power_dbm == pytest.approx(second.output_power_dbm, rel=1e-14, abs=1e-15)


def test_common_reciprocal_scaling_of_length_and_coefficient_preserves_result() -> None:
    scale = 7.0
    baseline = calculate_constant_attenuation(make_request(7.3, 0.17, -6.25))
    scaled = calculate_constant_attenuation(make_request(7.3 * scale, 0.17 / scale, -6.25))

    assert scaled.section_loss_db == pytest.approx(baseline.section_loss_db, rel=1e-14, abs=1e-15)
    assert scaled.output_power_dbm == pytest.approx(baseline.output_power_dbm, rel=1e-14, abs=1e-15)


def test_loss_increases_and_output_decreases_with_length() -> None:
    results = [
        calculate_constant_attenuation(make_request(length, 0.2, -3.0))
        for length in (1.0, 2.0, 3.0)
    ]

    assert results[0].section_loss_db < results[1].section_loss_db < results[2].section_loss_db
    assert results[0].output_power_dbm > results[1].output_power_dbm > results[2].output_power_dbm


def test_loss_increases_and_output_decreases_with_coefficient() -> None:
    results = [
        calculate_constant_attenuation(make_request(12.5, coefficient, -3.0))
        for coefficient in (0.1, 0.2, 0.3)
    ]

    assert results[0].section_loss_db < results[1].section_loss_db < results[2].section_loss_db
    assert results[0].output_power_dbm > results[1].output_power_dbm > results[2].output_power_dbm


@pytest.mark.parametrize(
    ("length_km", "attenuation_db_per_km", "input_power_dbm"),
    [(0.0, 0.0, 11.0), (1.5, 0.4, 8.0), (100.0, 0.01, -30.0)],
)
def test_passive_outputs_never_exceed_inputs(
    length_km: float,
    attenuation_db_per_km: float,
    input_power_dbm: float,
) -> None:
    request = make_request(length_km, attenuation_db_per_km, input_power_dbm)
    result = calculate_constant_attenuation(request)

    assert result.output_power_dbm <= request.input_power_dbm


def test_repeated_calculation_is_deterministic_and_does_not_mutate_request() -> None:
    request = make_request(12.5, 0.2, -3.0)
    request_before = request.model_dump()

    first = calculate_constant_attenuation(request)
    second = calculate_constant_attenuation(request)

    assert request.model_dump() == request_before
    assert request == ConstantAttenuationRequest.model_validate(request_before)
    assert first == second
    assert first.model_dump_json() == second.model_dump_json()
    assert json.loads(first.model_dump_json()) == first.model_dump(mode="json")


def test_finite_subnormal_multiplication_underflow_is_positive_zero() -> None:
    request = make_request(math.nextafter(0.0, 1.0), 0.5, -3.25)

    result = calculate_constant_attenuation(request)

    assert_positive_zero(result.section_loss_db)
    assert result.output_power_dbm == request.input_power_dbm


@pytest.mark.parametrize(
    ("length_km", "attenuation_db_per_km"),
    [(1.0e308, 0.0), (0.0, 1.0e308)],
)
def test_huge_zero_factor_cases_remain_valid_zero_loss_calculations(
    length_km: float,
    attenuation_db_per_km: float,
) -> None:
    request = make_request(length_km, attenuation_db_per_km, -12.0)

    result = calculate_constant_attenuation(request)

    assert_positive_zero(result.section_loss_db)
    assert result.output_power_dbm == request.input_power_dbm
    assert math.isfinite(result.output_power_dbm)


def test_loss_overflow_raises_exact_calculation_error() -> None:
    with pytest.raises(ConstantAttenuationCalculationError) as exc_info:
        calculate_constant_attenuation(make_request(1.0e308, 1.0e308, 0.0))

    assert str(exc_info.value) == ERROR_MESSAGE


def test_output_overflow_from_finite_loss_raises_exact_calculation_error() -> None:
    with pytest.raises(ConstantAttenuationCalculationError) as exc_info:
        calculate_constant_attenuation(make_request(1.0, 1.0e308, -sys.float_info.max))

    assert str(exc_info.value) == ERROR_MESSAGE


@pytest.mark.parametrize(
    ("length_km", "attenuation_db_per_km", "input_power_dbm"),
    [(12.5, 0.2, -3.0), (0.0, 0.0, 0.0), (1.0e308, 0.0, -sys.float_info.max)],
)
def test_successful_results_have_finite_loss_and_output(
    length_km: float,
    attenuation_db_per_km: float,
    input_power_dbm: float,
) -> None:
    result = calculate_constant_attenuation(
        make_request(length_km, attenuation_db_per_km, input_power_dbm)
    )

    assert math.isfinite(result.section_loss_db)
    assert math.isfinite(result.output_power_dbm)
