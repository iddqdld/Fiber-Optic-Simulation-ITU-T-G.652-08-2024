import json
import math

import pytest
from pydantic import ValidationError

from fibre_sim.attenuation import (
    ConstantAttenuationManifest,
    ConstantAttenuationRequest,
    ConstantAttenuationResult,
)

ASSUMPTIONS = (
    "uniform attenuation coefficient over the fibre section",
    "passive fibre loss only",
    "attenuation is additive in dB",
)
LIMITATIONS = (
    "attenuation coefficient is supplied rather than inferred from wavelength or material",
    "excludes splice, connector, bend, and engineering-margin losses",
    "not a G.652 conformance or typical-value model",
)


def valid_result_values() -> dict[str, object]:
    return {
        "length_km": 12.5,
        "attenuation_db_per_km": 0.2,
        "input_power_dbm": -3.0,
        "section_loss_db": 2.5,
        "output_power_dbm": -5.5,
        "model_manifest": ConstantAttenuationManifest(),
    }


def make_result(**overrides: object) -> ConstantAttenuationResult:
    values = valid_result_values()
    values.update(overrides)
    return ConstantAttenuationResult.model_validate(values)


def test_manifest_has_exact_fields_and_values() -> None:
    manifest = ConstantAttenuationManifest()

    assert list(ConstantAttenuationManifest.model_fields) == [
        "model_id",
        "model_version",
        "assumptions",
        "limitations",
    ]
    assert manifest.model_id == "constant_fibre_attenuation"
    assert manifest.model_version == "1.0.0"
    assert manifest.assumptions == ASSUMPTIONS
    assert manifest.limitations == LIMITATIONS


@pytest.mark.parametrize(
    ("field", "value"),
    [("model_id", "other_model"), ("model_version", "2.0.0")],
)
def test_manifest_rejects_alternative_literal_values(field: str, value: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        ConstantAttenuationManifest.model_validate({field: value})

    assert exc_info.value.errors()[0]["type"] == "literal_error"


def test_manifest_coerces_collections_to_immutable_tuples() -> None:
    manifest = ConstantAttenuationManifest.model_validate(
        {"assumptions": ["first", "second"], "limitations": ["only"]}
    )

    assert manifest.assumptions == ("first", "second")
    assert manifest.limitations == ("only",)
    assert isinstance(manifest.assumptions, tuple)
    assert isinstance(manifest.limitations, tuple)
    append_method = "append"
    with pytest.raises(AttributeError):
        getattr(manifest.assumptions, append_method)("unexpected")


def test_manifest_serializes_deterministically_as_json_arrays() -> None:
    first = ConstantAttenuationManifest()
    second = ConstantAttenuationManifest()

    assert first == second
    assert first.model_dump() == second.model_dump()
    assert first.model_dump_json() == second.model_dump_json()
    payload = first.model_dump(mode="json")
    assert isinstance(payload["assumptions"], list)
    assert isinstance(payload["limitations"], list)
    assert json.loads(first.model_dump_json()) == payload


def test_result_has_exact_fields_and_accepts_normal_values() -> None:
    result = make_result()

    assert list(ConstantAttenuationResult.model_fields) == [
        "length_km",
        "attenuation_db_per_km",
        "input_power_dbm",
        "section_loss_db",
        "output_power_dbm",
        "model_manifest",
    ]
    assert result.length_km == 12.5
    assert result.attenuation_db_per_km == 0.2
    assert result.input_power_dbm == -3.0
    assert result.section_loss_db == 2.5
    assert result.output_power_dbm == -5.5
    assert result.model_manifest == ConstantAttenuationManifest()


@pytest.mark.parametrize(
    (
        "length_km",
        "attenuation_db_per_km",
        "input_power_dbm",
        "section_loss_db",
        "output_power_dbm",
    ),
    [
        (0.0, 0.2, -3.0, 0.0, -3.0),
        (12.5, 0.0, -3.0, 0.0, -3.0),
        (0.0, 0.0, 0.0, 0.0, 0.0),
        (1.0, 0.1, 7.25, 0.0, 7.25),
        (1.0, 0.1, -7.25, 0.0, -7.25),
    ],
)
def test_result_accepts_range_boundaries_and_signed_input_power(
    length_km: float,
    attenuation_db_per_km: float,
    input_power_dbm: float,
    section_loss_db: float,
    output_power_dbm: float,
) -> None:
    result = make_result(
        length_km=length_km,
        attenuation_db_per_km=attenuation_db_per_km,
        input_power_dbm=input_power_dbm,
        section_loss_db=section_loss_db,
        output_power_dbm=output_power_dbm,
    )

    assert result.length_km == length_km
    assert result.attenuation_db_per_km == attenuation_db_per_km
    assert result.input_power_dbm == input_power_dbm
    assert result.section_loss_db == section_loss_db
    assert result.output_power_dbm == output_power_dbm


@pytest.mark.parametrize("field", ["length_km", "attenuation_db_per_km", "section_loss_db"])
def test_result_rejects_negative_nonnegative_fields(field: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(**{field: -1.0})

    assert exc_info.value.errors()[0]["type"] == "greater_than_equal"


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
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_result_rejects_non_finite_numeric_values(field: str, value: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(**{field: value})

    assert exc_info.value.errors()[0]["type"] == "finite_number"


def test_all_models_reject_extras_and_are_frozen() -> None:
    models = (
        ConstantAttenuationRequest(
            length_km=12.5,
            attenuation_db_per_km=0.2,
            input_power_dbm=-3.0,
        ),
        ConstantAttenuationManifest(),
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


def test_result_rejects_output_above_input_with_exact_error() -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(input_power_dbm=-3.0, output_power_dbm=0.0)

    error = exc_info.value.errors()[0]
    assert error["type"] == "passive_output_power_exceeds_input"
    assert error["msg"] == "Passive attenuation output power cannot exceed input power."


def test_result_accepts_equal_output_and_input_power() -> None:
    result = make_result(input_power_dbm=-3.0, output_power_dbm=-3.0)

    assert result.output_power_dbm == result.input_power_dbm


def test_result_accepts_output_below_input_power() -> None:
    result = make_result(input_power_dbm=-3.0, output_power_dbm=-4.0)

    assert result.output_power_dbm < result.input_power_dbm


def test_result_does_not_cross_enforce_attenuation_or_power_balance_formulas() -> None:
    result = make_result(
        length_km=4.0,
        attenuation_db_per_km=0.5,
        input_power_dbm=10.0,
        section_loss_db=0.25,
        output_power_dbm=9.0,
    )

    assert result.section_loss_db != result.length_km * result.attenuation_db_per_km
    assert result.output_power_dbm != result.input_power_dbm - result.section_loss_db
    assert result.output_power_dbm < result.input_power_dbm


def test_result_json_schema_is_explicit_and_references_manifest() -> None:
    schema = ConstantAttenuationResult.model_json_schema()

    assert list(schema["properties"]) == [
        "length_km",
        "attenuation_db_per_km",
        "input_power_dbm",
        "section_loss_db",
        "output_power_dbm",
        "model_manifest",
    ]
    assert schema["required"] == [
        "length_km",
        "attenuation_db_per_km",
        "input_power_dbm",
        "section_loss_db",
        "output_power_dbm",
        "model_manifest",
    ]
    assert schema["additionalProperties"] is False

    for field in (
        "length_km",
        "attenuation_db_per_km",
        "input_power_dbm",
        "section_loss_db",
        "output_power_dbm",
    ):
        assert schema["properties"][field]["type"] == "number"
        assert "allow_inf_nan" not in schema["properties"][field]
    for field in ("length_km", "attenuation_db_per_km", "section_loss_db"):
        assert schema["properties"][field]["minimum"] == 0
    for field in ("input_power_dbm", "output_power_dbm"):
        assert "minimum" not in schema["properties"][field]

    assert schema["properties"]["model_manifest"]["$ref"] == ("#/$defs/ConstantAttenuationManifest")

    manifest_schema = schema["$defs"]["ConstantAttenuationManifest"]
    assert manifest_schema["additionalProperties"] is False
    assert list(manifest_schema["properties"]) == [
        "model_id",
        "model_version",
        "assumptions",
        "limitations",
    ]
    assert manifest_schema["properties"]["model_id"]["const"] == ("constant_fibre_attenuation")
    assert manifest_schema["properties"]["model_id"]["default"] == ("constant_fibre_attenuation")
    assert manifest_schema["properties"]["model_version"]["const"] == "1.0.0"
    assert manifest_schema["properties"]["model_version"]["default"] == "1.0.0"
