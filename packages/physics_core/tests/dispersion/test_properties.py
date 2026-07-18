import json
import math

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from pydantic import BaseModel, ValidationError

from fibre_sim.dispersion import (
    ChromaticPulseBroadeningRequest,
    ChromaticPulseBroadeningResult,
    GroupDelayRequest,
    GroupDelayResult,
    calculate_chromatic_pulse_broadening,
    calculate_group_delay,
)


@st.composite
def broadening_values(draw: st.DrawFn) -> tuple[float, float, float, float]:
    return (
        draw(st.floats(0.0, 100.0, allow_nan=False, allow_infinity=False)),
        draw(st.floats(-100.0, 100.0, allow_nan=False, allow_infinity=False)),
        draw(st.floats(0.0, 100.0, allow_nan=False, allow_infinity=False)),
        draw(st.floats(1e-6, 100.0, allow_nan=False, allow_infinity=False)),
    )


@st.composite
def positive_broadening_values(draw: st.DrawFn) -> tuple[float, float, float, float]:
    return (
        draw(st.floats(1e-6, 100.0, allow_nan=False, allow_infinity=False)),
        draw(st.floats(-100.0, 100.0, allow_nan=False, allow_infinity=False)),
        draw(st.floats(1e-6, 100.0, allow_nan=False, allow_infinity=False)),
        draw(st.floats(1e-6, 100.0, allow_nan=False, allow_infinity=False)),
    )


def broadening_request(
    values: tuple[float, float, float, float],
) -> ChromaticPulseBroadeningRequest:
    return ChromaticPulseBroadeningRequest(
        length_km=values[0],
        dispersion_ps_per_nm_km=values[1],
        spectral_width_fwhm_nm=values[2],
        input_pulse_fwhm_ps=values[3],
    )


@settings(max_examples=75, derandomize=True)
@given(broadening_values())
def test_zero_spectral_width_is_an_identity(values: tuple[float, float, float, float]) -> None:
    values = (values[0], values[1], 0.0, values[3])
    result = calculate_chromatic_pulse_broadening(broadening_request(values))

    assert result.dispersion_broadening_fwhm_ps == 0.0
    assert math.copysign(1.0, result.dispersion_broadening_fwhm_ps) == 1.0
    assert result.output_pulse_fwhm_ps == result.input_pulse_fwhm_ps


@settings(max_examples=75, derandomize=True)
@given(
    st.floats(0.0, 100.0, allow_nan=False, allow_infinity=False),
    st.floats(0.0, 100.0, allow_nan=False, allow_infinity=False),
    st.sampled_from((-1.0, 1.0)),
)
def test_broadening_is_monotonic_in_absolute_dispersion(
    magnitude: float, increment: float, sign: float
) -> None:
    larger_magnitude = magnitude + increment
    first = calculate_chromatic_pulse_broadening(
        broadening_request((2.0, sign * magnitude, 0.5, 10.0))
    )
    second = calculate_chromatic_pulse_broadening(
        broadening_request((2.0, sign * larger_magnitude, 0.5, 10.0))
    )

    assert second.dispersion_broadening_fwhm_ps >= first.dispersion_broadening_fwhm_ps
    assert second.output_pulse_fwhm_ps >= first.output_pulse_fwhm_ps


@settings(max_examples=75, derandomize=True)
@given(
    st.floats(1e-6, 100.0, allow_nan=False, allow_infinity=False),
    st.floats(1e-6, 100.0, allow_nan=False, allow_infinity=False),
)
def test_broadening_is_monotonic_in_length_and_spectral_width(
    length: float, increment: float
) -> None:
    longer = calculate_chromatic_pulse_broadening(
        broadening_request((length + increment, 17.0, 0.4, 10.0))
    )
    shorter = calculate_chromatic_pulse_broadening(broadening_request((length, 17.0, 0.4, 10.0)))
    wider = calculate_chromatic_pulse_broadening(
        broadening_request((length, 17.0, 0.4 + increment, 10.0))
    )

    assert longer.dispersion_broadening_fwhm_ps >= shorter.dispersion_broadening_fwhm_ps
    assert wider.dispersion_broadening_fwhm_ps >= shorter.dispersion_broadening_fwhm_ps


@settings(max_examples=75, derandomize=True)
@given(
    st.floats(0.0, 100.0, allow_nan=False, allow_infinity=False),
    st.floats(0.0, 100.0, allow_nan=False, allow_infinity=False),
    st.floats(-100.0, 100.0, allow_nan=False, allow_infinity=False),
    st.floats(0.0, 100.0, allow_nan=False, allow_infinity=False),
)
def test_section_broadening_contributions_are_additive(
    first_length: float, second_length: float, dispersion: float, spectral_width: float
) -> None:
    full = calculate_chromatic_pulse_broadening(
        broadening_request((first_length + second_length, dispersion, spectral_width, 10.0))
    )
    first = calculate_chromatic_pulse_broadening(
        broadening_request((first_length, dispersion, spectral_width, 10.0))
    )
    second = calculate_chromatic_pulse_broadening(
        broadening_request((second_length, dispersion, spectral_width, 10.0))
    )

    assert full.accumulated_dispersion_ps_per_nm == pytest.approx(
        first.accumulated_dispersion_ps_per_nm + second.accumulated_dispersion_ps_per_nm,
        rel=1e-12,
        abs=1e-12,
    )
    assert full.dispersion_broadening_fwhm_ps == pytest.approx(
        first.dispersion_broadening_fwhm_ps + second.dispersion_broadening_fwhm_ps,
        rel=1e-12,
        abs=1e-12,
    )


@settings(max_examples=75, derandomize=True)
@given(
    st.floats(0.0, 100.0, allow_nan=False, allow_infinity=False),
    st.floats(1e-6, 100.0, allow_nan=False, allow_infinity=False),
)
def test_group_delay_is_linear_and_zero_length_is_identity(
    length: float, group_index: float
) -> None:
    request = GroupDelayRequest(length_km=length, group_index_dimensionless=group_index)
    result = calculate_group_delay(request)
    doubled = calculate_group_delay(
        GroupDelayRequest(length_km=2.0 * length, group_index_dimensionless=group_index)
    )
    doubled_index = calculate_group_delay(
        GroupDelayRequest(length_km=length, group_index_dimensionless=2.0 * group_index)
    )

    assert doubled.group_delay_ps == pytest.approx(
        2.0 * result.group_delay_ps, rel=1e-12, abs=1e-12
    )
    assert doubled_index.group_delay_ps == pytest.approx(
        2.0 * result.group_delay_ps, rel=1e-12, abs=1e-12
    )
    zero = calculate_group_delay(
        GroupDelayRequest(length_km=0.0, group_index_dimensionless=group_index)
    )
    assert zero.group_delay_ps == 0.0


@settings(max_examples=75, derandomize=True)
@given(
    st.floats(0.0, 100.0, allow_nan=False, allow_infinity=False),
    st.floats(0.0, 100.0, allow_nan=False, allow_infinity=False),
    st.floats(1e-6, 100.0, allow_nan=False, allow_infinity=False),
)
def test_group_delay_is_additive_across_sections(
    first_length: float, second_length: float, group_index: float
) -> None:
    full = calculate_group_delay(
        GroupDelayRequest(
            length_km=first_length + second_length, group_index_dimensionless=group_index
        )
    )
    first = calculate_group_delay(
        GroupDelayRequest(length_km=first_length, group_index_dimensionless=group_index)
    )
    second = calculate_group_delay(
        GroupDelayRequest(length_km=second_length, group_index_dimensionless=group_index)
    )

    assert full.group_delay_ps == pytest.approx(
        first.group_delay_ps + second.group_delay_ps, rel=1e-12, abs=1e-12
    )


@settings(max_examples=50, derandomize=True)
@given(positive_broadening_values())
def test_dispersion_results_round_trip_through_json(
    values: tuple[float, float, float, float],
) -> None:
    broadening = calculate_chromatic_pulse_broadening(broadening_request(values))
    group_delay = calculate_group_delay(
        GroupDelayRequest(length_km=values[0], group_index_dimensionless=values[3])
    )

    assert ChromaticPulseBroadeningRequest.model_validate(
        json.loads(broadening_request(values).model_dump_json())
    ) == broadening_request(values)
    assert (
        ChromaticPulseBroadeningResult.model_validate(json.loads(broadening.model_dump_json()))
        == broadening
    )
    assert GroupDelayRequest.model_validate(
        json.loads(
            GroupDelayRequest(
                length_km=values[0], group_index_dimensionless=values[3]
            ).model_dump_json()
        )
    ) == GroupDelayRequest(length_km=values[0], group_index_dimensionless=values[3])
    assert GroupDelayResult.model_validate(json.loads(group_delay.model_dump_json())) == group_delay


@pytest.mark.parametrize(
    ("model", "fields"),
    [
        (
            ChromaticPulseBroadeningRequest,
            {
                "length_km": 1.0,
                "dispersion_ps_per_nm_km": 1.0,
                "spectral_width_fwhm_nm": 1.0,
                "input_pulse_fwhm_ps": 1.0,
            },
        ),
        (GroupDelayRequest, {"length_km": 1.0, "group_index_dimensionless": 1.0}),
    ],
)
@pytest.mark.parametrize("value", [None, "not-a-number", [], {}])
def test_dispersion_requests_reject_malformed_values(
    model: type[BaseModel], fields: dict[str, object], value: object
) -> None:
    field = next(iter(fields))
    malformed = {**fields, field: value}

    with pytest.raises(ValidationError):
        model.model_validate(malformed)


@pytest.mark.parametrize(
    ("model", "fields"),
    [
        (
            ChromaticPulseBroadeningResult,
            {
                "length_km": 1.0,
                "dispersion_ps_per_nm_km": 1.0,
                "spectral_width_fwhm_nm": 1.0,
                "input_pulse_fwhm_ps": 1.0,
                "accumulated_dispersion_ps_per_nm": 1.0,
                "dispersion_broadening_fwhm_ps": 1.0,
                "output_pulse_fwhm_ps": math.sqrt(2.0),
                "model_manifest": {},
            },
        ),
        (
            GroupDelayResult,
            {
                "length_km": 1.0,
                "group_index_dimensionless": 1.0,
                "group_delay_ps": 1.0,
                "model_manifest": {},
            },
        ),
    ],
)
@pytest.mark.parametrize("value", [None, "not-a-number", [], {}])
def test_dispersion_results_reject_malformed_values(
    model: type[BaseModel], fields: dict[str, object], value: object
) -> None:
    field = next(field for field in fields if field != "model_manifest")
    malformed = {**fields, field: value}

    with pytest.raises(ValidationError):
        model.model_validate(malformed)
