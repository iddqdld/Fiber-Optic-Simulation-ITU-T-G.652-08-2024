import json
import math
import sys

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from pydantic import ValidationError

from fibre_sim.attenuation import (
    ConstantAttenuationRequest,
    ConstantAttenuationResult,
    calculate_constant_attenuation,
)


@st.composite
def attenuation_values(draw: st.DrawFn) -> tuple[float, float, float]:
    return (
        draw(st.floats(0.0, 1_000.0, allow_nan=False, allow_infinity=False)),
        draw(st.floats(0.0, 1_000.0, allow_nan=False, allow_infinity=False)),
        draw(st.floats(-1_000.0, 1_000.0, allow_nan=False, allow_infinity=False)),
    )


@settings(max_examples=75, derandomize=True)
@given(attenuation_values())
def test_passive_output_never_exceeds_input(values: tuple[float, float, float]) -> None:
    request = ConstantAttenuationRequest(
        length_km=values[0], attenuation_db_per_km=values[1], input_power_dbm=values[2]
    )

    result = calculate_constant_attenuation(request)

    assert result.output_power_dbm <= result.input_power_dbm
    assert result.section_loss_db >= 0.0


@settings(max_examples=75, derandomize=True)
@given(
    st.floats(0.0, 1_000.0, allow_nan=False, allow_infinity=False),
    st.floats(0.0, 1_000.0, allow_nan=False, allow_infinity=False),
    st.floats(0.0, 1_000.0, allow_nan=False, allow_infinity=False),
    st.floats(-1_000.0, 1_000.0, allow_nan=False, allow_infinity=False),
)
def test_attenuation_is_additive_across_sequential_sections(
    first_length: float, second_length: float, coefficient: float, input_power: float
) -> None:
    full = calculate_constant_attenuation(
        ConstantAttenuationRequest(
            length_km=first_length + second_length,
            attenuation_db_per_km=coefficient,
            input_power_dbm=input_power,
        )
    )
    first = calculate_constant_attenuation(
        ConstantAttenuationRequest(
            length_km=first_length,
            attenuation_db_per_km=coefficient,
            input_power_dbm=input_power,
        )
    )
    second = calculate_constant_attenuation(
        ConstantAttenuationRequest(
            length_km=second_length,
            attenuation_db_per_km=coefficient,
            input_power_dbm=first.output_power_dbm,
        )
    )

    assert full.section_loss_db == pytest.approx(
        first.section_loss_db + second.section_loss_db, rel=1e-12, abs=1e-12
    )
    assert full.output_power_dbm == pytest.approx(second.output_power_dbm, rel=1e-12, abs=1e-12)


@settings(max_examples=75, derandomize=True)
@given(
    st.floats(0.0, 1_000.0, allow_nan=False, allow_infinity=False),
    st.floats(0.0, 1_000.0, allow_nan=False, allow_infinity=False),
)
def test_zero_length_is_an_identity(length_unused: float, input_power: float) -> None:
    request = ConstantAttenuationRequest(
        length_km=0.0,
        attenuation_db_per_km=length_unused,
        input_power_dbm=input_power,
    )

    result = calculate_constant_attenuation(request)

    assert result.section_loss_db == 0.0
    assert math.copysign(1.0, result.section_loss_db) == 1.0
    assert result.output_power_dbm == input_power


@settings(max_examples=50, derandomize=True)
@given(attenuation_values())
def test_attenuation_request_and_result_json_round_trip(
    values: tuple[float, float, float],
) -> None:
    request = ConstantAttenuationRequest(
        length_km=values[0], attenuation_db_per_km=values[1], input_power_dbm=values[2]
    )
    result = calculate_constant_attenuation(request)

    assert (
        ConstantAttenuationRequest.model_validate(json.loads(request.model_dump_json())) == request
    )
    assert ConstantAttenuationResult.model_validate(json.loads(result.model_dump_json())) == result


@pytest.mark.parametrize("field", ["length_km", "attenuation_db_per_km", "input_power_dbm"])
@pytest.mark.parametrize("value", [None, "not-a-number", [], {}])
def test_attenuation_request_rejects_malformed_values(field: str, value: object) -> None:
    values: dict[str, object] = {
        "length_km": 1.0,
        "attenuation_db_per_km": 0.2,
        "input_power_dbm": -3.0,
    }
    values[field] = value

    with pytest.raises(ValidationError):
        ConstantAttenuationRequest.model_validate(values)


@pytest.mark.parametrize(
    "field",
    [
        "length_km",
        "attenuation_db_per_km",
        "input_power_dbm",
        "section_loss_db",
        "output_power_dbm",
    ],
)
@pytest.mark.parametrize("value", [None, "not-a-number", [], {}])
def test_attenuation_result_rejects_malformed_values(field: str, value: object) -> None:
    result = calculate_constant_attenuation(
        ConstantAttenuationRequest(length_km=1.0, attenuation_db_per_km=0.2, input_power_dbm=-3.0)
    )
    values = result.model_dump()
    values[field] = value

    with pytest.raises(ValidationError):
        ConstantAttenuationResult.model_validate(values)


def test_zero_factors_accept_extreme_finite_request_values() -> None:
    request = ConstantAttenuationRequest(
        length_km=sys.float_info.max,
        attenuation_db_per_km=0.0,
        input_power_dbm=-sys.float_info.max,
    )

    result = calculate_constant_attenuation(request)

    assert result.output_power_dbm == request.input_power_dbm
    assert math.isfinite(result.output_power_dbm)
