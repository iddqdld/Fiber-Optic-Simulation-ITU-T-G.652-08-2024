import json
import math

import pytest
from pydantic import ValidationError

from fibre_sim.dispersion import (
    ChromaticPulseBroadeningManifest,
    ChromaticPulseBroadeningRequest,
    ChromaticPulseBroadeningResult,
)

ASSUMPTIONS = (
    "constant supplied chromatic-dispersion coefficient over the fibre section",
    "Gaussian input pulse and Gaussian source spectrum use FWHM widths",
    "independent Gaussian broadening contributions combine in quadrature",
    "pulse-width broadening uses the magnitude of chromatic dispersion",
)
LIMITATIONS = (
    "first-order delay-spread approximation rather than full pulse propagation",
    "dispersion sign is retained for accumulated dispersion but not pulse-width magnitude",
    "excludes initial chirp, higher-order dispersion, nonlinearity, and "
    "polarization-mode dispersion",
    "not a G.652 dispersion fit or conformance model",
)


def valid_result_values() -> dict[str, object]:
    return {
        "length_km": 12.5,
        "dispersion_ps_per_nm_km": -17.0,
        "spectral_width_fwhm_nm": 0.4,
        "input_pulse_fwhm_ps": 10.0,
        "accumulated_dispersion_ps_per_nm": -212.5,
        "dispersion_broadening_fwhm_ps": 85.0,
        "output_pulse_fwhm_ps": 85.58621384311844,
        "model_manifest": ChromaticPulseBroadeningManifest(),
    }


def make_result(**overrides: object) -> ChromaticPulseBroadeningResult:
    values = valid_result_values()
    values.update(overrides)
    return ChromaticPulseBroadeningResult.model_validate(values)


def test_manifest_has_exact_fields_values_and_tuples() -> None:
    manifest = ChromaticPulseBroadeningManifest()

    assert list(ChromaticPulseBroadeningManifest.model_fields) == [
        "model_id",
        "model_version",
        "width_convention",
        "assumptions",
        "limitations",
    ]
    assert manifest.model_id == "first_order_chromatic_pulse_broadening"
    assert manifest.model_version == "1.0.0"
    assert manifest.width_convention == "fwhm"
    assert manifest.assumptions == ASSUMPTIONS
    assert manifest.limitations == LIMITATIONS
    assert isinstance(manifest.assumptions, tuple)
    assert isinstance(manifest.limitations, tuple)
    assert all(
        not field.is_required() for field in ChromaticPulseBroadeningManifest.model_fields.values()
    )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("model_id", "other_model"),
        ("model_version", "2.0.0"),
        ("width_convention", "rms"),
    ],
)
def test_manifest_rejects_alternative_literal_values(field: str, value: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        ChromaticPulseBroadeningManifest.model_validate({field: value})

    assert exc_info.value.errors()[0]["type"] == "literal_error"


def test_manifest_coerces_collections_to_immutable_tuples() -> None:
    manifest = ChromaticPulseBroadeningManifest.model_validate(
        {"assumptions": ["first", "second"], "limitations": ["only"]}
    )

    assert manifest.assumptions == ("first", "second")
    assert manifest.limitations == ("only",)
    assert isinstance(manifest.assumptions, tuple)
    assert isinstance(manifest.limitations, tuple)
    append_method = "append"
    with pytest.raises(AttributeError):
        getattr(manifest.assumptions, append_method)("unexpected")


def test_manifest_serializes_deterministically_with_json_arrays() -> None:
    first = ChromaticPulseBroadeningManifest()
    second = ChromaticPulseBroadeningManifest()

    assert first == second
    assert first.model_dump() == second.model_dump()
    assert first.model_dump_json() == second.model_dump_json()
    payload = first.model_dump(mode="json")
    assert isinstance(payload["assumptions"], list)
    assert isinstance(payload["limitations"], list)
    assert payload["assumptions"] == list(ASSUMPTIONS)
    assert payload["limitations"] == list(LIMITATIONS)
    assert json.loads(first.model_dump_json()) == payload


def test_result_has_exact_required_fields_and_accepts_normal_values() -> None:
    result = make_result()

    assert list(ChromaticPulseBroadeningResult.model_fields) == [
        "length_km",
        "dispersion_ps_per_nm_km",
        "spectral_width_fwhm_nm",
        "input_pulse_fwhm_ps",
        "accumulated_dispersion_ps_per_nm",
        "dispersion_broadening_fwhm_ps",
        "output_pulse_fwhm_ps",
        "model_manifest",
    ]
    assert all(
        field.is_required() for field in ChromaticPulseBroadeningResult.model_fields.values()
    )
    assert result.length_km == 12.5
    assert result.dispersion_ps_per_nm_km == -17.0
    assert result.spectral_width_fwhm_nm == 0.4
    assert result.input_pulse_fwhm_ps == 10.0
    assert result.accumulated_dispersion_ps_per_nm == -212.5
    assert result.dispersion_broadening_fwhm_ps == 85.0
    assert result.output_pulse_fwhm_ps == 85.58621384311844
    assert result.model_manifest == ChromaticPulseBroadeningManifest()


def test_result_requires_all_fields() -> None:
    with pytest.raises(ValidationError) as exc_info:
        ChromaticPulseBroadeningResult.model_validate({})

    assert {error["loc"][0] for error in exc_info.value.errors()} == set(
        ChromaticPulseBroadeningResult.model_fields
    )


@pytest.mark.parametrize(
    (
        "length_km",
        "dispersion_ps_per_nm_km",
        "spectral_width_fwhm_nm",
        "input_pulse_fwhm_ps",
        "accumulated_dispersion_ps_per_nm",
        "dispersion_broadening_fwhm_ps",
        "output_pulse_fwhm_ps",
    ),
    [
        (0.0, -17.0, 0.4, 10.0, 0.0, 0.0, 10.0),
        (-0.0, -0.0, 0.0, 1e-300, -0.0, 0.0, 1e-300),
        (12.5, 0.0, 0.4, 10.0, 0.0, 0.0, 10.0),
        (12.5, 17.0, 0.4, 10.0, 212.5, 85.0, 85.58621384311844),
        (12.5, -17.0, 0.0, 10.0, -212.5, 0.0, 10.0),
    ],
)
def test_result_accepts_range_boundaries_and_signed_dispersion(
    length_km: float,
    dispersion_ps_per_nm_km: float,
    spectral_width_fwhm_nm: float,
    input_pulse_fwhm_ps: float,
    accumulated_dispersion_ps_per_nm: float,
    dispersion_broadening_fwhm_ps: float,
    output_pulse_fwhm_ps: float,
) -> None:
    result = make_result(
        length_km=length_km,
        dispersion_ps_per_nm_km=dispersion_ps_per_nm_km,
        spectral_width_fwhm_nm=spectral_width_fwhm_nm,
        input_pulse_fwhm_ps=input_pulse_fwhm_ps,
        accumulated_dispersion_ps_per_nm=accumulated_dispersion_ps_per_nm,
        dispersion_broadening_fwhm_ps=dispersion_broadening_fwhm_ps,
        output_pulse_fwhm_ps=output_pulse_fwhm_ps,
    )

    assert result.length_km == length_km
    assert result.dispersion_ps_per_nm_km == dispersion_ps_per_nm_km
    assert result.spectral_width_fwhm_nm == spectral_width_fwhm_nm
    assert result.input_pulse_fwhm_ps == input_pulse_fwhm_ps
    assert result.accumulated_dispersion_ps_per_nm == accumulated_dispersion_ps_per_nm
    assert result.dispersion_broadening_fwhm_ps == dispersion_broadening_fwhm_ps
    assert result.output_pulse_fwhm_ps == output_pulse_fwhm_ps
    if math.copysign(1.0, dispersion_ps_per_nm_km) == -1.0:
        assert math.copysign(1.0, result.dispersion_ps_per_nm_km) == -1.0


@pytest.mark.parametrize(
    "field",
    ["length_km", "spectral_width_fwhm_nm", "dispersion_broadening_fwhm_ps"],
)
def test_result_rejects_negative_nonnegative_fields(field: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(**{field: -1.0})

    assert exc_info.value.errors()[0]["type"] == "greater_than_equal"


@pytest.mark.parametrize("field", ["input_pulse_fwhm_ps", "output_pulse_fwhm_ps"])
@pytest.mark.parametrize("value", [0.0, -1.0])
def test_result_rejects_nonpositive_pulse_widths(field: str, value: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(**{field: value})

    assert exc_info.value.errors()[0]["type"] == "greater_than"


@pytest.mark.parametrize(
    "field",
    [
        "length_km",
        "dispersion_ps_per_nm_km",
        "spectral_width_fwhm_nm",
        "input_pulse_fwhm_ps",
        "accumulated_dispersion_ps_per_nm",
        "dispersion_broadening_fwhm_ps",
        "output_pulse_fwhm_ps",
    ],
)
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_result_rejects_nonfinite_numeric_values(field: str, value: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(**{field: value})

    assert exc_info.value.errors()[0]["type"] == "finite_number"


def test_all_models_reject_extras_and_are_frozen() -> None:
    models = (
        ChromaticPulseBroadeningRequest(
            length_km=12.5,
            dispersion_ps_per_nm_km=-17.0,
            spectral_width_fwhm_nm=0.4,
            input_pulse_fwhm_ps=10.0,
        ),
        ChromaticPulseBroadeningManifest(),
        make_result(),
    )

    for model in models:
        payload = model.model_dump()
        payload["unexpected"] = "forbidden"
        with pytest.raises(ValidationError) as exc_info:
            type(model).model_validate(payload)
        assert exc_info.value.errors()[0]["type"] == "extra_forbidden"

        field_name = next(iter(type(model).model_fields))
        with pytest.raises(ValidationError) as exc_info:
            setattr(model, field_name, model.model_dump()[field_name])
        assert exc_info.value.errors()[0]["type"] == "frozen_instance"


def test_result_serializes_deterministically() -> None:
    first = make_result()
    second = make_result()

    assert first == second
    assert first.model_dump() == second.model_dump()
    assert first.model_dump(mode="json") == second.model_dump(mode="json")
    assert first.model_dump_json() == second.model_dump_json()
    assert json.loads(first.model_dump_json()) == first.model_dump(mode="json")


def test_result_rejects_narrower_output_with_exact_error_code_and_message() -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(output_pulse_fwhm_ps=9.999)

    error = exc_info.value.errors()[0]
    assert error["type"] == "output_pulse_narrower_than_input"
    assert error["msg"] == "First-order chromatic broadening cannot reduce pulse FWHM."


def test_result_accepts_equal_output_and_input_pulse_width() -> None:
    result = make_result(output_pulse_fwhm_ps=10.0)

    assert result.output_pulse_fwhm_ps == result.input_pulse_fwhm_ps


def test_result_accepts_wider_output_pulse_width() -> None:
    result = make_result(output_pulse_fwhm_ps=10.001)

    assert result.output_pulse_fwhm_ps > result.input_pulse_fwhm_ps


def test_result_does_not_cross_validate_dispersion_broadening_or_quadrature_formulas() -> None:
    result = make_result(
        length_km=4.0,
        dispersion_ps_per_nm_km=-2.5,
        spectral_width_fwhm_nm=0.8,
        input_pulse_fwhm_ps=10.0,
        accumulated_dispersion_ps_per_nm=0.0,
        dispersion_broadening_fwhm_ps=1.0,
        output_pulse_fwhm_ps=12.0,
    )

    assert result.accumulated_dispersion_ps_per_nm != (
        result.dispersion_ps_per_nm_km * result.length_km
    )
    assert result.dispersion_broadening_fwhm_ps != (
        abs(result.dispersion_ps_per_nm_km) * result.length_km * result.spectral_width_fwhm_nm
    )
    assert result.output_pulse_fwhm_ps != pytest.approx(
        math.sqrt(result.input_pulse_fwhm_ps**2 + result.dispersion_broadening_fwhm_ps**2)
    )


def test_manifest_json_schema_has_exact_defaults_literals_and_constraints() -> None:
    schema = ChromaticPulseBroadeningManifest.model_json_schema()

    assert schema["additionalProperties"] is False
    assert list(schema["properties"]) == [
        "model_id",
        "model_version",
        "width_convention",
        "assumptions",
        "limitations",
    ]
    assert "required" not in schema

    model_id_schema = schema["properties"]["model_id"]
    version_schema = schema["properties"]["model_version"]
    width_schema = schema["properties"]["width_convention"]
    assumptions_schema = schema["properties"]["assumptions"]
    limitations_schema = schema["properties"]["limitations"]

    assert model_id_schema["const"] == "first_order_chromatic_pulse_broadening"
    assert model_id_schema["default"] == "first_order_chromatic_pulse_broadening"
    assert version_schema["const"] == "1.0.0"
    assert version_schema["default"] == "1.0.0"
    assert width_schema["const"] == "fwhm"
    assert width_schema["default"] == "fwhm"
    assert assumptions_schema["type"] == "array"
    assert assumptions_schema["items"] == {"type": "string"}
    assert assumptions_schema["default"] == list(ASSUMPTIONS)
    assert limitations_schema["type"] == "array"
    assert limitations_schema["items"] == {"type": "string"}
    assert limitations_schema["default"] == list(LIMITATIONS)


def test_result_json_schema_is_explicit_and_references_manifest() -> None:
    schema = ChromaticPulseBroadeningResult.model_json_schema()

    assert list(schema["properties"]) == [
        "length_km",
        "dispersion_ps_per_nm_km",
        "spectral_width_fwhm_nm",
        "input_pulse_fwhm_ps",
        "accumulated_dispersion_ps_per_nm",
        "dispersion_broadening_fwhm_ps",
        "output_pulse_fwhm_ps",
        "model_manifest",
    ]
    assert schema["required"] == [
        "length_km",
        "dispersion_ps_per_nm_km",
        "spectral_width_fwhm_nm",
        "input_pulse_fwhm_ps",
        "accumulated_dispersion_ps_per_nm",
        "dispersion_broadening_fwhm_ps",
        "output_pulse_fwhm_ps",
        "model_manifest",
    ]
    assert schema["additionalProperties"] is False

    numeric_fields = (
        "length_km",
        "dispersion_ps_per_nm_km",
        "spectral_width_fwhm_nm",
        "input_pulse_fwhm_ps",
        "accumulated_dispersion_ps_per_nm",
        "dispersion_broadening_fwhm_ps",
        "output_pulse_fwhm_ps",
    )
    for field in numeric_fields:
        field_schema = schema["properties"][field]
        assert field_schema["type"] == "number"
        assert "allow_inf_nan" not in field_schema

    assert schema["properties"]["length_km"]["minimum"] == 0
    assert schema["properties"]["spectral_width_fwhm_nm"]["minimum"] == 0
    assert schema["properties"]["dispersion_broadening_fwhm_ps"]["minimum"] == 0
    for field in ("dispersion_ps_per_nm_km", "accumulated_dispersion_ps_per_nm"):
        assert "minimum" not in schema["properties"][field]
        assert "exclusiveMinimum" not in schema["properties"][field]
    for field in ("input_pulse_fwhm_ps", "output_pulse_fwhm_ps"):
        assert schema["properties"][field]["exclusiveMinimum"] == 0
        assert "minimum" not in schema["properties"][field]

    assert schema["properties"]["model_manifest"]["$ref"] == (
        "#/$defs/ChromaticPulseBroadeningManifest"
    )
