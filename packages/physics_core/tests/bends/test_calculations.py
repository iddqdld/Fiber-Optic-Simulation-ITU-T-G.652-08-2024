import math
import sys

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from fibre_sim.bends import (
    MAX_MACROBENDS,
    MacrobendInput,
    MacrobendLossCalculationError,
    MacrobendLossManifest,
    MacrobendLossPoint,
    MacrobendLossRequest,
    MacrobendLossResult,
    calculate_macrobend_loss,
)

ERROR_MESSAGE = "Macrobend loss aggregation produced a non-finite result."


def make_bend(**overrides: object) -> MacrobendInput:
    values: dict[str, object] = {
        "position_fraction": 0.25,
        "radius_mm": 10.0,
        "angle_deg": 90.0,
        "supplied_loss_db": 1.5,
    }
    values.update(overrides)
    return MacrobendInput.model_validate(values)


def make_request(**overrides: object) -> MacrobendLossRequest:
    values: dict[str, object] = {
        "input_power_dbm": -3.0,
        "bends": (make_bend(),),
    }
    values.update(overrides)
    return MacrobendLossRequest.model_validate(values)


def assert_positive_zero(value: float) -> None:
    assert value == 0.0
    assert math.copysign(1.0, value) == 1.0


def test_calculation_error_is_a_value_error_with_exact_message() -> None:
    assert issubclass(MacrobendLossCalculationError, ValueError)
    assert str(MacrobendLossCalculationError(ERROR_MESSAGE)) == ERROR_MESSAGE


def test_empty_request_is_an_identity_with_empty_bends() -> None:
    request = make_request(input_power_dbm=-7.25, bends=())

    result = calculate_macrobend_loss(request)

    assert type(result) is MacrobendLossResult
    assert result.input_power_dbm == request.input_power_dbm
    assert_positive_zero(result.total_bend_loss_db)
    assert result.output_power_dbm == request.input_power_dbm
    assert result.bends == ()
    assert result.model_manifest == MacrobendLossManifest()


def test_zero_supplied_losses_are_an_identity_with_positive_zero_aggregates() -> None:
    request = make_request(
        input_power_dbm=7.5,
        bends=(
            make_bend(position_fraction=0.1, supplied_loss_db=0.0),
            make_bend(position_fraction=0.9, supplied_loss_db=-0.0),
        ),
    )

    result = calculate_macrobend_loss(request)

    assert_positive_zero(result.total_bend_loss_db)
    assert result.output_power_dbm == request.input_power_dbm
    assert all(point.output_power_dbm == request.input_power_dbm for point in result.bends)
    assert all(math.copysign(1.0, point.cumulative_bend_loss_db) == 1.0 for point in result.bends)


def test_reference_vector_is_exact_and_preserves_all_geometry_metadata() -> None:
    request = make_request(
        input_power_dbm=-3.5,
        bends=(
            make_bend(
                position_fraction=0.0,
                radius_mm=50.0,
                angle_deg=360.0,
                supplied_loss_db=1.25,
            ),
            make_bend(
                position_fraction=0.5,
                radius_mm=12.5,
                angle_deg=180.0,
                supplied_loss_db=0.5,
            ),
            make_bend(
                position_fraction=1.0,
                radius_mm=3.0,
                angle_deg=45.0,
                supplied_loss_db=2.0,
            ),
        ),
    )

    result = calculate_macrobend_loss(request)

    assert result.total_bend_loss_db == 3.75
    assert result.output_power_dbm == -7.25
    assert result.bends == (
        MacrobendLossPoint(
            position_fraction=0.0,
            radius_mm=50.0,
            angle_deg=360.0,
            supplied_loss_db=1.25,
            cumulative_bend_loss_db=1.25,
            output_power_dbm=-4.75,
        ),
        MacrobendLossPoint(
            position_fraction=0.5,
            radius_mm=12.5,
            angle_deg=180.0,
            supplied_loss_db=0.5,
            cumulative_bend_loss_db=1.75,
            output_power_dbm=-5.25,
        ),
        MacrobendLossPoint(
            position_fraction=1.0,
            radius_mm=3.0,
            angle_deg=45.0,
            supplied_loss_db=2.0,
            cumulative_bend_loss_db=3.75,
            output_power_dbm=-7.25,
        ),
    )


def test_result_bends_echo_request_in_order_and_obey_sequence_invariants() -> None:
    request = make_request(
        input_power_dbm=10.0,
        bends=(
            make_bend(position_fraction=0.1, radius_mm=8.0, angle_deg=30.0, supplied_loss_db=0.25),
            make_bend(position_fraction=0.6, radius_mm=16.0, angle_deg=60.0, supplied_loss_db=1.5),
            make_bend(position_fraction=0.9, radius_mm=4.0, angle_deg=120.0, supplied_loss_db=0.0),
        ),
    )

    result = calculate_macrobend_loss(request)

    assert len(result.bends) == len(request.bends)
    assert tuple(point.position_fraction for point in result.bends) == tuple(
        bend.position_fraction for bend in request.bends
    )
    assert tuple(point.radius_mm for point in result.bends) == tuple(
        bend.radius_mm for bend in request.bends
    )
    assert tuple(point.angle_deg for point in result.bends) == tuple(
        bend.angle_deg for bend in request.bends
    )
    assert tuple(point.supplied_loss_db for point in result.bends) == tuple(
        bend.supplied_loss_db for bend in request.bends
    )
    assert all(
        current >= previous
        for previous, current in zip(
            (0.0, *[point.cumulative_bend_loss_db for point in result.bends]),
            [point.cumulative_bend_loss_db for point in result.bends],
            strict=False,
        )
    )
    assert all(point.output_power_dbm <= request.input_power_dbm for point in result.bends)
    assert all(
        previous >= current
        for previous, current in zip(
            (request.input_power_dbm, *[point.output_power_dbm for point in result.bends]),
            [point.output_power_dbm for point in result.bends],
            strict=False,
        )
    )
    assert result.total_bend_loss_db == result.bends[-1].cumulative_bend_loss_db
    assert result.output_power_dbm == result.bends[-1].output_power_dbm


def test_additive_db_aggregation_matches_sequential_application() -> None:
    first_bend = make_bend(position_fraction=0.2, supplied_loss_db=1.25)
    second_bend = make_bend(position_fraction=0.8, supplied_loss_db=2.75)
    request = make_request(input_power_dbm=-4.0, bends=(first_bend, second_bend))

    result = calculate_macrobend_loss(request)
    first = calculate_macrobend_loss(make_request(input_power_dbm=-4.0, bends=(first_bend,)))
    second = calculate_macrobend_loss(
        make_request(input_power_dbm=first.output_power_dbm, bends=(second_bend,))
    )

    assert result.total_bend_loss_db == first.total_bend_loss_db + second.total_bend_loss_db
    assert result.output_power_dbm == second.output_power_dbm
    assert result.total_bend_loss_db == 4.0
    assert result.output_power_dbm == -8.0


def test_geometry_metadata_does_not_change_supplied_loss_arithmetic() -> None:
    losses = (0.5, 1.25, 2.0)
    plain = make_request(
        input_power_dbm=3.0,
        bends=tuple(
            make_bend(
                position_fraction=position,
                radius_mm=10.0,
                angle_deg=90.0,
                supplied_loss_db=loss,
            )
            for position, loss in zip((0.1, 0.5, 0.9), losses, strict=True)
        ),
    )
    changed_geometry = make_request(
        input_power_dbm=3.0,
        bends=tuple(
            make_bend(
                position_fraction=position,
                radius_mm=radius,
                angle_deg=angle,
                supplied_loss_db=loss,
            )
            for position, radius, angle, loss in zip(
                (0.2, 0.4, 1.0), (0.1, 999.0, 2.5), (1.0, 359.0, 270.0), losses, strict=True
            )
        ),
    )

    first = calculate_macrobend_loss(plain)
    second = calculate_macrobend_loss(changed_geometry)

    assert first.total_bend_loss_db == second.total_bend_loss_db == sum(losses)
    assert first.output_power_dbm == second.output_power_dbm == 3.0 - sum(losses)
    assert tuple(point.supplied_loss_db for point in first.bends) == tuple(
        point.supplied_loss_db for point in second.bends
    )


def test_calculation_does_not_mutate_request_or_nested_bends() -> None:
    request = make_request(
        bends=(
            make_bend(position_fraction=0.2, supplied_loss_db=0.5),
            make_bend(position_fraction=0.8, supplied_loss_db=1.0),
        )
    )
    before = request.model_dump()
    before_json = request.model_dump_json()

    calculate_macrobend_loss(request)

    assert request.model_dump() == before
    assert request.model_dump_json() == before_json
    assert request.bends[0].supplied_loss_db == 0.5
    assert request.bends[1].supplied_loss_db == 1.0


def test_maximum_bend_count_calculates_without_truncation() -> None:
    bends_at_limit = tuple(
        make_bend(
            position_fraction=(index + 1) / (MAX_MACROBENDS + 1),
            supplied_loss_db=0.25,
        )
        for index in range(MAX_MACROBENDS)
    )

    result = calculate_macrobend_loss(make_request(bends=bends_at_limit))

    assert len(result.bends) == MAX_MACROBENDS
    assert result.total_bend_loss_db == MAX_MACROBENDS * 0.25
    assert result.output_power_dbm == -3.0 - MAX_MACROBENDS * 0.25


def test_overflow_in_total_loss_raises_the_public_calculation_error() -> None:
    request = make_request(
        bends=(
            make_bend(position_fraction=0.25, supplied_loss_db=sys.float_info.max),
            make_bend(position_fraction=0.75, supplied_loss_db=sys.float_info.max),
        )
    )

    with pytest.raises(MacrobendLossCalculationError) as exc_info:
        calculate_macrobend_loss(request)

    assert str(exc_info.value) == ERROR_MESSAGE


def test_overflow_in_output_power_raises_the_public_calculation_error() -> None:
    request = make_request(
        input_power_dbm=-sys.float_info.max,
        bends=(make_bend(position_fraction=0.5, supplied_loss_db=sys.float_info.max),),
    )

    with pytest.raises(MacrobendLossCalculationError) as exc_info:
        calculate_macrobend_loss(request)

    assert str(exc_info.value) == ERROR_MESSAGE


@settings(max_examples=50, derandomize=True)
@given(
    st.floats(-10_000.0, 10_000.0, allow_nan=False, allow_infinity=False),
    st.lists(
        st.floats(0.0, 1_000.0, allow_nan=False, allow_infinity=False),
        min_size=0,
        max_size=MAX_MACROBENDS,
    ),
)
def test_generated_nonnegative_loss_vectors_are_passive_and_consistent(
    input_power: float, losses: list[float]
) -> None:
    positions = tuple((index + 1) / (len(losses) + 1) for index in range(len(losses)))
    request = make_request(
        input_power_dbm=input_power,
        bends=tuple(
            make_bend(position_fraction=position, supplied_loss_db=loss)
            for position, loss in zip(positions, losses, strict=True)
        ),
    )

    result = calculate_macrobend_loss(request)
    expected_total = sum(losses)

    assert result.total_bend_loss_db == pytest.approx(expected_total)
    assert result.output_power_dbm == pytest.approx(input_power - expected_total)
    assert result.output_power_dbm <= input_power
    assert all(
        previous <= current
        for previous, current in zip(
            (0.0, *[point.cumulative_bend_loss_db for point in result.bends]),
            [point.cumulative_bend_loss_db for point in result.bends],
            strict=False,
        )
    )


@settings(max_examples=40, derandomize=True)
@given(
    st.floats(0.0, 1_000.0, allow_nan=False, allow_infinity=False),
    st.floats(0.0, 1_000.0, allow_nan=False, allow_infinity=False),
    st.floats(-10_000.0, 10_000.0, allow_nan=False, allow_infinity=False),
)
def test_generated_two_bend_vectors_are_additive(
    first_loss: float, second_loss: float, input_power: float
) -> None:
    request = make_request(
        input_power_dbm=input_power,
        bends=(
            make_bend(position_fraction=0.25, supplied_loss_db=first_loss),
            make_bend(position_fraction=0.75, supplied_loss_db=second_loss),
        ),
    )

    result = calculate_macrobend_loss(request)

    assert result.total_bend_loss_db == pytest.approx(first_loss + second_loss)
    assert result.bends[0].cumulative_bend_loss_db == first_loss
    assert result.bends[1].cumulative_bend_loss_db == pytest.approx(first_loss + second_loss)
    assert result.output_power_dbm == pytest.approx(input_power - first_loss - second_loss)


def test_calculation_result_json_round_trip_is_lossless() -> None:
    request = make_request(
        input_power_dbm=-12.5,
        bends=(
            make_bend(position_fraction=0.2, supplied_loss_db=0.125),
            make_bend(position_fraction=0.8, supplied_loss_db=2.375),
        ),
    )
    result = calculate_macrobend_loss(request)

    restored = MacrobendLossResult.model_validate_json(result.model_dump_json())

    assert restored == result
    assert restored.model_manifest == MacrobendLossManifest()
