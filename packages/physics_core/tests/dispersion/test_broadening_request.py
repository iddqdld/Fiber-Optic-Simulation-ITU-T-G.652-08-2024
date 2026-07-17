import math

import pytest
from pydantic import ValidationError

import fibre_sim.dispersion as dispersion
from fibre_sim.dispersion import (
    ChromaticPulseBroadeningManifest,
    ChromaticPulseBroadeningRequest,
    ChromaticPulseBroadeningResult,
)


def valid_request_values() -> dict[str, object]:
    return {
        "length_km": 12.5,
        "dispersion_ps_per_nm_km": -17.0,
        "spectral_width_fwhm_nm": 0.4,
        "input_pulse_fwhm_ps": 10.0,
    }


def test_public_broadening_exports_are_importable_and_precede_group_delay_exports() -> None:
    broadening_exports = [
        "ChromaticPulseBroadeningRequest",
        "ChromaticPulseBroadeningManifest",
        "ChromaticPulseBroadeningResult",
    ]

    assert set(dispersion.__all__[:3]) == set(broadening_exports)
    assert set(broadening_exports).issubset(dispersion.__all__)
    assert all(
        dispersion.__all__.index(name) < dispersion.__all__.index("GroupDelayCalculationError")
        for name in broadening_exports
    )
    assert [getattr(dispersion, name) for name in broadening_exports] == [
        ChromaticPulseBroadeningRequest,
        ChromaticPulseBroadeningManifest,
        ChromaticPulseBroadeningResult,
    ]
    assert not hasattr(dispersion, "calculate_chromatic_pulse_broadening")


def test_request_has_exact_required_fields_and_accepts_normal_values() -> None:
    request = ChromaticPulseBroadeningRequest.model_validate(valid_request_values())

    assert list(ChromaticPulseBroadeningRequest.model_fields) == [
        "length_km",
        "dispersion_ps_per_nm_km",
        "spectral_width_fwhm_nm",
        "input_pulse_fwhm_ps",
    ]
    assert all(
        field.is_required() for field in ChromaticPulseBroadeningRequest.model_fields.values()
    )
    assert request.length_km == 12.5
    assert request.dispersion_ps_per_nm_km == -17.0
    assert request.spectral_width_fwhm_nm == 0.4
    assert request.input_pulse_fwhm_ps == 10.0


def test_request_requires_all_fields() -> None:
    with pytest.raises(ValidationError) as exc_info:
        ChromaticPulseBroadeningRequest.model_validate({})

    assert {error["loc"][0] for error in exc_info.value.errors()} == {
        "length_km",
        "dispersion_ps_per_nm_km",
        "spectral_width_fwhm_nm",
        "input_pulse_fwhm_ps",
    }


@pytest.mark.parametrize(
    ("length_km", "dispersion_ps_per_nm_km", "spectral_width_fwhm_nm", "input_pulse_fwhm_ps"),
    [
        (0.0, -17.0, 0.4, 10.0),
        (-0.0, -0.0, 0.0, 1e-300),
        (12.5, 0.0, 0.4, 10.0),
        (12.5, 17.0, 0.4, 10.0),
        (12.5, -17.0, 0.0, 10.0),
    ],
)
def test_request_accepts_range_boundaries_and_signed_dispersion(
    length_km: float,
    dispersion_ps_per_nm_km: float,
    spectral_width_fwhm_nm: float,
    input_pulse_fwhm_ps: float,
) -> None:
    request = ChromaticPulseBroadeningRequest(
        length_km=length_km,
        dispersion_ps_per_nm_km=dispersion_ps_per_nm_km,
        spectral_width_fwhm_nm=spectral_width_fwhm_nm,
        input_pulse_fwhm_ps=input_pulse_fwhm_ps,
    )

    assert request.length_km == length_km
    assert request.dispersion_ps_per_nm_km == dispersion_ps_per_nm_km
    assert request.spectral_width_fwhm_nm == spectral_width_fwhm_nm
    assert request.input_pulse_fwhm_ps == input_pulse_fwhm_ps
    if math.copysign(1.0, dispersion_ps_per_nm_km) == -1.0:
        assert math.copysign(1.0, request.dispersion_ps_per_nm_km) == -1.0


@pytest.mark.parametrize("field", ["length_km", "spectral_width_fwhm_nm"])
def test_request_rejects_negative_nonnegative_fields(field: str) -> None:
    values = valid_request_values()
    values[field] = -1.0

    with pytest.raises(ValidationError) as exc_info:
        ChromaticPulseBroadeningRequest.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "greater_than_equal"


@pytest.mark.parametrize("value", [0.0, -1.0])
def test_request_rejects_nonpositive_input_pulse_width(value: float) -> None:
    values = valid_request_values()
    values["input_pulse_fwhm_ps"] = value

    with pytest.raises(ValidationError) as exc_info:
        ChromaticPulseBroadeningRequest.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "greater_than"


@pytest.mark.parametrize(
    "field",
    [
        "length_km",
        "dispersion_ps_per_nm_km",
        "spectral_width_fwhm_nm",
        "input_pulse_fwhm_ps",
    ],
)
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_request_rejects_nonfinite_numeric_values(field: str, value: float) -> None:
    values = valid_request_values()
    values[field] = value

    with pytest.raises(ValidationError) as exc_info:
        ChromaticPulseBroadeningRequest.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "finite_number"


def test_request_serializes_deterministically() -> None:
    values = valid_request_values()
    first = ChromaticPulseBroadeningRequest.model_validate(values)
    second = ChromaticPulseBroadeningRequest.model_validate(values)

    assert first == second
    assert first.model_dump() == values
    assert first.model_dump() == second.model_dump()
    assert first.model_dump_json() == second.model_dump_json()
    assert first.model_dump_json() == (
        '{"length_km":12.5,"dispersion_ps_per_nm_km":-17.0,'
        '"spectral_width_fwhm_nm":0.4,"input_pulse_fwhm_ps":10.0}'
    )


def test_request_rejects_unknown_fields_and_is_frozen() -> None:
    values = valid_request_values()
    values["unexpected"] = "forbidden"

    with pytest.raises(ValidationError) as exc_info:
        ChromaticPulseBroadeningRequest.model_validate(values)

    assert exc_info.value.errors()[0]["type"] == "extra_forbidden"

    request = ChromaticPulseBroadeningRequest.model_validate(valid_request_values())
    with pytest.raises(ValidationError) as exc_info:
        request.length_km = 13.0

    assert exc_info.value.errors()[0]["type"] == "frozen_instance"


def test_request_json_schema_is_explicit_and_unit_descriptive() -> None:
    schema = ChromaticPulseBroadeningRequest.model_json_schema()

    assert list(schema["properties"]) == [
        "length_km",
        "dispersion_ps_per_nm_km",
        "spectral_width_fwhm_nm",
        "input_pulse_fwhm_ps",
    ]
    assert schema["required"] == [
        "length_km",
        "dispersion_ps_per_nm_km",
        "spectral_width_fwhm_nm",
        "input_pulse_fwhm_ps",
    ]
    assert schema["additionalProperties"] is False

    for field_schema in schema["properties"].values():
        assert field_schema["type"] == "number"
        assert "allow_inf_nan" not in field_schema

    length_schema = schema["properties"]["length_km"]
    dispersion_schema = schema["properties"]["dispersion_ps_per_nm_km"]
    spectral_schema = schema["properties"]["spectral_width_fwhm_nm"]
    input_schema = schema["properties"]["input_pulse_fwhm_ps"]

    assert length_schema["minimum"] == 0
    assert "exclusiveMinimum" not in length_schema
    assert spectral_schema["minimum"] == 0
    assert "exclusiveMinimum" not in spectral_schema
    assert "minimum" not in dispersion_schema
    assert "exclusiveMinimum" not in dispersion_schema
    assert input_schema["exclusiveMinimum"] == 0
    assert "minimum" not in input_schema

    assert "length" in length_schema["description"].lower()
    assert "kilometre" in length_schema["description"].lower()
    assert "dispersion" in dispersion_schema["description"].lower()
    assert all(unit in dispersion_schema["description"].lower() for unit in ("ps", "nm", "km"))
    assert {"spectral", "fwhm", "nm"}.issubset(
        {word.strip(".,()") for word in spectral_schema["description"].lower().split()}
    )
    assert {"input", "pulse", "fwhm", "ps"}.issubset(
        {word.strip(".,()") for word in input_schema["description"].lower().split()}
    )
