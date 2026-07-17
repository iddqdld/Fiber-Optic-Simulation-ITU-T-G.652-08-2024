import json
import math

import pytest
from pydantic import ValidationError

from fibre_sim.standards import (
    G652DDispersionCheckManifest,
    G652DDispersionCheckResult,
    G652DDispersionCheckStatus,
    G652DDispersionFitRegion,
)

ASSUMPTIONS = (
    "supplied chromatic-dispersion coefficient is compared at the same wavelength as the envelope",
    "values equal to either published envelope boundary pass",
    "signed margins are positive inside the envelope and negative beyond the violated boundary",
)
LIMITATIONS = (
    "a passing dispersion check is not complete G.652.D conformance",
    "the supplied coefficient is accepted as input rather than measured or independently validated",
    "excludes measurement uncertainty, longitudinal variation, and statistical link design",
    "checks only the represented chromatic-dispersion coefficient attribute",
)


def valid_result_values() -> dict[str, object]:
    supplied = 17.0
    minimum = 13.305
    maximum = 18.592
    return {
        "wavelength_nm": 1550.0,
        "supplied_dispersion_ps_per_nm_km": supplied,
        "fit_region": G652DDispersionFitRegion.LINEAR,
        "minimum_dispersion_ps_per_nm_km": minimum,
        "maximum_dispersion_ps_per_nm_km": maximum,
        "margin_above_minimum_ps_per_nm_km": supplied - minimum,
        "margin_below_maximum_ps_per_nm_km": maximum - supplied,
        "status": G652DDispersionCheckStatus.PASS,
        "model_manifest": G652DDispersionCheckManifest(),
    }


def make_result(**overrides: object) -> G652DDispersionCheckResult:
    values = valid_result_values()
    values.update(overrides)
    return G652DDispersionCheckResult.model_validate(values)


def test_status_values_string_behavior_and_json_behavior_are_stable() -> None:
    assert [status.name for status in G652DDispersionCheckStatus] == [
        "PASS",
        "FAIL_BELOW_MINIMUM",
        "FAIL_ABOVE_MAXIMUM",
    ]
    assert [status.value for status in G652DDispersionCheckStatus] == [
        "pass",
        "fail_below_minimum",
        "fail_above_maximum",
    ]
    assert [str(status) for status in G652DDispersionCheckStatus] == [
        "pass",
        "fail_below_minimum",
        "fail_above_maximum",
    ]
    assert G652DDispersionCheckStatus("pass") is G652DDispersionCheckStatus.PASS
    assert json.dumps(G652DDispersionCheckStatus.FAIL_ABOVE_MAXIMUM) == '"fail_above_maximum"'


def test_manifest_has_exact_fields_values_and_immutable_tuples() -> None:
    manifest = G652DDispersionCheckManifest()

    assert list(G652DDispersionCheckManifest.model_fields) == [
        "model_id",
        "model_version",
        "envelope_model_id",
        "envelope_model_version",
        "standard_name",
        "standard_edition",
        "fibre_category",
        "comparison_rule",
        "assumptions",
        "limitations",
    ]
    assert manifest.model_id == "itu_t_g652d_chromatic_dispersion_check"
    assert manifest.model_version == "1.0.0"
    assert manifest.envelope_model_id == "itu_t_g652d_chromatic_dispersion_envelope"
    assert manifest.envelope_model_version == "1.0.0"
    assert manifest.standard_name == "ITU-T G.652"
    assert manifest.standard_edition == "08/2024"
    assert manifest.fibre_category == "G.652.D"
    assert manifest.comparison_rule == "inclusive_envelope"
    assert manifest.assumptions == ASSUMPTIONS
    assert manifest.limitations == LIMITATIONS
    assert isinstance(manifest.assumptions, tuple)
    assert isinstance(manifest.limitations, tuple)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("model_id", "other_model"),
        ("model_version", "2.0.0"),
        ("envelope_model_id", "other_envelope"),
        ("envelope_model_version", "2.0.0"),
        ("standard_name", "ITU-T G.652 (other edition)"),
        ("standard_edition", "01/2025"),
        ("fibre_category", "G.652.B"),
        ("comparison_rule", "exclusive_envelope"),
    ],
)
def test_manifest_rejects_alternative_literal_values(field: str, value: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        G652DDispersionCheckManifest.model_validate({field: value})

    error = exc_info.value.errors()[0]
    assert error["loc"] == (field,)
    assert error["type"] == "literal_error"


def test_manifest_coerces_collections_to_immutable_tuples() -> None:
    manifest = G652DDispersionCheckManifest.model_validate(
        {"assumptions": list(ASSUMPTIONS), "limitations": list(LIMITATIONS)}
    )

    assert manifest.assumptions == ASSUMPTIONS
    assert manifest.limitations == LIMITATIONS
    assert isinstance(manifest.assumptions, tuple)
    assert isinstance(manifest.limitations, tuple)
    append_method = "append"
    with pytest.raises(AttributeError):
        getattr(manifest.assumptions, append_method)("unexpected")


def test_manifest_rejects_unknown_fields_and_is_frozen() -> None:
    values = {"unexpected": "forbidden"}

    with pytest.raises(ValidationError) as exc_info:
        G652DDispersionCheckManifest.model_validate(values)

    error = exc_info.value.errors()[0]
    assert error["loc"] == ("unexpected",)
    assert error["type"] == "extra_forbidden"

    manifest = G652DDispersionCheckManifest()
    for field in ("model_id", "assumptions"):
        with pytest.raises(ValidationError) as exc_info:
            setattr(manifest, field, getattr(manifest, field))

        error = exc_info.value.errors()[0]
        assert error["loc"] == (field,)
        assert error["type"] == "frozen_instance"


def test_manifest_serializes_deterministically_as_json_arrays() -> None:
    first = G652DDispersionCheckManifest()
    second = G652DDispersionCheckManifest()

    assert first == second
    assert first.model_dump() == second.model_dump()
    assert first.model_dump_json() == second.model_dump_json()
    payload = first.model_dump(mode="json")
    assert payload["assumptions"] == list(ASSUMPTIONS)
    assert payload["limitations"] == list(LIMITATIONS)
    assert json.loads(first.model_dump_json()) == payload


def test_manifest_json_schema_has_exact_literal_defaults_and_collections() -> None:
    schema = G652DDispersionCheckManifest.model_json_schema()

    assert schema["additionalProperties"] is False
    assert list(schema["properties"]) == [
        "model_id",
        "model_version",
        "envelope_model_id",
        "envelope_model_version",
        "standard_name",
        "standard_edition",
        "fibre_category",
        "comparison_rule",
        "assumptions",
        "limitations",
    ]
    assert "required" not in schema

    literal_defaults = {
        "model_id": "itu_t_g652d_chromatic_dispersion_check",
        "model_version": "1.0.0",
        "envelope_model_id": "itu_t_g652d_chromatic_dispersion_envelope",
        "envelope_model_version": "1.0.0",
        "standard_name": "ITU-T G.652",
        "standard_edition": "08/2024",
        "fibre_category": "G.652.D",
        "comparison_rule": "inclusive_envelope",
    }
    for field, literal_default in literal_defaults.items():
        field_schema = schema["properties"][field]
        assert field_schema["const"] == literal_default
        assert field_schema["default"] == literal_default

    for field, tuple_default in (("assumptions", ASSUMPTIONS), ("limitations", LIMITATIONS)):
        field_schema = schema["properties"][field]
        assert field_schema["type"] == "array"
        assert field_schema["items"] == {"type": "string"}
        assert field_schema["default"] == list(tuple_default)


def test_result_has_exact_required_fields_and_accepts_normal_values() -> None:
    result = make_result()

    assert list(G652DDispersionCheckResult.model_fields) == [
        "wavelength_nm",
        "supplied_dispersion_ps_per_nm_km",
        "fit_region",
        "minimum_dispersion_ps_per_nm_km",
        "maximum_dispersion_ps_per_nm_km",
        "margin_above_minimum_ps_per_nm_km",
        "margin_below_maximum_ps_per_nm_km",
        "status",
        "model_manifest",
    ]
    assert all(field.is_required() for field in G652DDispersionCheckResult.model_fields.values())
    assert result.wavelength_nm == 1550.0
    assert result.supplied_dispersion_ps_per_nm_km == 17.0
    assert result.fit_region is G652DDispersionFitRegion.LINEAR
    assert result.minimum_dispersion_ps_per_nm_km == 13.305
    assert result.maximum_dispersion_ps_per_nm_km == 18.592
    assert result.margin_above_minimum_ps_per_nm_km == 17.0 - 13.305
    assert result.margin_below_maximum_ps_per_nm_km == 18.592 - 17.0
    assert result.status is G652DDispersionCheckStatus.PASS
    assert result.model_manifest == G652DDispersionCheckManifest()


def test_result_requires_all_fields_and_reports_locations() -> None:
    with pytest.raises(ValidationError) as exc_info:
        G652DDispersionCheckResult.model_validate({})

    fields = [
        "wavelength_nm",
        "supplied_dispersion_ps_per_nm_km",
        "fit_region",
        "minimum_dispersion_ps_per_nm_km",
        "maximum_dispersion_ps_per_nm_km",
        "margin_above_minimum_ps_per_nm_km",
        "margin_below_maximum_ps_per_nm_km",
        "status",
        "model_manifest",
    ]
    errors = exc_info.value.errors()
    assert [error["loc"] for error in errors] == [(field,) for field in fields]
    assert all(error["type"] == "missing" for error in errors)


@pytest.mark.parametrize("wavelength_nm", [1260.0, 1625.0])
def test_result_accepts_inclusive_wavelength_boundaries(wavelength_nm: float) -> None:
    result = make_result(wavelength_nm=wavelength_nm)

    assert result.wavelength_nm == wavelength_nm


@pytest.mark.parametrize(
    ("wavelength_nm", "error_type"),
    [
        (math.nextafter(1260.0, -math.inf), "greater_than_equal"),
        (math.nextafter(1625.0, math.inf), "less_than_equal"),
    ],
)
def test_result_rejects_wavelength_outside_inclusive_domain(
    wavelength_nm: float, error_type: str
) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(wavelength_nm=wavelength_nm)

    error = exc_info.value.errors()[0]
    assert error["loc"] == ("wavelength_nm",)
    assert error["type"] == error_type


@pytest.mark.parametrize(
    "field",
    [
        "wavelength_nm",
        "supplied_dispersion_ps_per_nm_km",
        "minimum_dispersion_ps_per_nm_km",
        "maximum_dispersion_ps_per_nm_km",
        "margin_above_minimum_ps_per_nm_km",
        "margin_below_maximum_ps_per_nm_km",
    ],
)
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_result_rejects_nonfinite_numeric_values(field: str, value: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(**{field: value})

    error = exc_info.value.errors()[0]
    assert error["loc"] == (field,)
    assert error["type"] == "finite_number"


@pytest.mark.parametrize(
    "field",
    [
        "wavelength_nm",
        "supplied_dispersion_ps_per_nm_km",
        "minimum_dispersion_ps_per_nm_km",
        "maximum_dispersion_ps_per_nm_km",
        "margin_above_minimum_ps_per_nm_km",
        "margin_below_maximum_ps_per_nm_km",
    ],
)
@pytest.mark.parametrize("value", [True, False, "1.0"])
def test_result_rejects_non_strict_numeric_values(field: str, value: object) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(**{field: value})

    error = exc_info.value.errors()[0]
    assert error["loc"] == (field,)
    assert error["type"] == "float_type"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("supplied_dispersion_ps_per_nm_km", -17.0),
        ("minimum_dispersion_ps_per_nm_km", -13.305),
        ("maximum_dispersion_ps_per_nm_km", -1.0),
        ("margin_above_minimum_ps_per_nm_km", -3.695),
        ("margin_below_maximum_ps_per_nm_km", -1.592),
    ],
)
def test_result_accepts_signed_finite_numeric_values(field: str, value: float) -> None:
    if field == "minimum_dispersion_ps_per_nm_km":
        result = make_result(
            minimum_dispersion_ps_per_nm_km=value,
            maximum_dispersion_ps_per_nm_km=0.0,
        )
    elif field == "maximum_dispersion_ps_per_nm_km":
        result = make_result(
            minimum_dispersion_ps_per_nm_km=-2.0,
            maximum_dispersion_ps_per_nm_km=value,
        )
    else:
        result = make_result(**{field: value})

    assert getattr(result, field) == value


@pytest.mark.parametrize(
    ("supplied", "margin_above", "margin_below", "status"),
    [
        (
            13.0,
            13.0 - 13.305,
            18.592 - 13.0,
            G652DDispersionCheckStatus.FAIL_BELOW_MINIMUM,
        ),
        (
            19.0,
            19.0 - 13.305,
            18.592 - 19.0,
            G652DDispersionCheckStatus.FAIL_ABOVE_MAXIMUM,
        ),
    ],
)
def test_result_accepts_directional_failure_fixtures_with_negative_margins(
    supplied: float,
    margin_above: float,
    margin_below: float,
    status: G652DDispersionCheckStatus,
) -> None:
    result = make_result(
        supplied_dispersion_ps_per_nm_km=supplied,
        margin_above_minimum_ps_per_nm_km=margin_above,
        margin_below_maximum_ps_per_nm_km=margin_below,
        status=status,
    )

    assert result.supplied_dispersion_ps_per_nm_km == supplied
    assert result.margin_above_minimum_ps_per_nm_km == margin_above
    assert result.margin_below_maximum_ps_per_nm_km == margin_below
    assert result.status is status


def test_result_rejects_reversed_bounds_with_exact_error_and_location() -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_result(
            minimum_dispersion_ps_per_nm_km=2.0,
            maximum_dispersion_ps_per_nm_km=1.0,
        )

    errors = exc_info.value.errors()
    assert len(errors) == 1
    assert errors[0]["loc"] == ()
    assert errors[0]["type"] == "dispersion_check_bounds_reversed"
    assert errors[0]["msg"] == "G.652.D dispersion-check minimum cannot exceed maximum."


def test_result_accepts_equal_bounds() -> None:
    result = make_result(
        minimum_dispersion_ps_per_nm_km=1.0,
        maximum_dispersion_ps_per_nm_km=1.0,
    )

    assert result.minimum_dispersion_ps_per_nm_km == 1.0
    assert result.maximum_dispersion_ps_per_nm_km == 1.0


def test_result_does_not_cross_validate_region_status_or_margin_formulas() -> None:
    result = make_result(
        supplied_dispersion_ps_per_nm_km=-999.0,
        fit_region=G652DDispersionFitRegion.THREE_TERM_SELLMEIER,
        margin_above_minimum_ps_per_nm_km=123.0,
        margin_below_maximum_ps_per_nm_km=-456.0,
        status=G652DDispersionCheckStatus.PASS,
    )

    assert result.supplied_dispersion_ps_per_nm_km == -999.0
    assert result.fit_region is G652DDispersionFitRegion.THREE_TERM_SELLMEIER
    assert result.margin_above_minimum_ps_per_nm_km == 123.0
    assert result.margin_below_maximum_ps_per_nm_km == -456.0
    assert result.status is G652DDispersionCheckStatus.PASS


def test_result_rejects_unknown_fields_and_is_frozen() -> None:
    values = valid_result_values()
    values["unexpected"] = "forbidden"

    with pytest.raises(ValidationError) as exc_info:
        G652DDispersionCheckResult.model_validate(values)

    error = exc_info.value.errors()[0]
    assert error["loc"] == ("unexpected",)
    assert error["type"] == "extra_forbidden"

    result = make_result()
    for field in ("wavelength_nm", "status", "model_manifest"):
        with pytest.raises(ValidationError) as exc_info:
            setattr(result, field, getattr(result, field))

        error = exc_info.value.errors()[0]
        assert error["loc"] == (field,)
        assert error["type"] == "frozen_instance"


def test_result_serializes_deterministically_with_enum_and_nested_manifest() -> None:
    first = make_result()
    second = make_result()

    assert first == second
    assert first.model_dump() == second.model_dump()
    assert first.model_dump(mode="json") == second.model_dump(mode="json")
    assert first.model_dump_json() == second.model_dump_json()
    payload = first.model_dump(mode="json")
    assert payload["fit_region"] == "linear"
    assert payload["status"] == "pass"
    assert payload["model_manifest"]["assumptions"] == list(ASSUMPTIONS)
    assert payload["model_manifest"]["limitations"] == list(LIMITATIONS)
    assert json.loads(first.model_dump_json()) == payload


def test_result_json_schema_is_explicit_and_references_manifest_region_and_status() -> None:
    schema = G652DDispersionCheckResult.model_json_schema()

    fields = [
        "wavelength_nm",
        "supplied_dispersion_ps_per_nm_km",
        "fit_region",
        "minimum_dispersion_ps_per_nm_km",
        "maximum_dispersion_ps_per_nm_km",
        "margin_above_minimum_ps_per_nm_km",
        "margin_below_maximum_ps_per_nm_km",
        "status",
        "model_manifest",
    ]
    assert list(schema["properties"]) == fields
    assert schema["required"] == fields
    assert schema["additionalProperties"] is False

    wavelength_schema = schema["properties"]["wavelength_nm"]
    assert wavelength_schema["type"] == "number"
    assert wavelength_schema["minimum"] == 1260.0
    assert wavelength_schema["maximum"] == 1625.0
    assert "allow_inf_nan" not in wavelength_schema

    for field in (
        "supplied_dispersion_ps_per_nm_km",
        "minimum_dispersion_ps_per_nm_km",
        "maximum_dispersion_ps_per_nm_km",
        "margin_above_minimum_ps_per_nm_km",
        "margin_below_maximum_ps_per_nm_km",
    ):
        field_schema = schema["properties"][field]
        assert field_schema["type"] == "number"
        assert "minimum" not in field_schema
        assert "maximum" not in field_schema
        assert "allow_inf_nan" not in field_schema

    assert schema["properties"]["fit_region"]["$ref"] == "#/$defs/G652DDispersionFitRegion"
    assert schema["$defs"]["G652DDispersionFitRegion"]["enum"] == [
        "three_term_sellmeier",
        "linear",
    ]
    assert schema["properties"]["status"]["$ref"] == "#/$defs/G652DDispersionCheckStatus"
    assert schema["$defs"]["G652DDispersionCheckStatus"]["enum"] == [
        "pass",
        "fail_below_minimum",
        "fail_above_maximum",
    ]
    assert schema["properties"]["model_manifest"]["$ref"] == (
        "#/$defs/G652DDispersionCheckManifest"
    )
