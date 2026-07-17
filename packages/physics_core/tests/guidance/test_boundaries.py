import math
from typing import Literal

import pytest
from pydantic import ValidationError

import fibre_sim.guidance.result as result_module
from fibre_sim.guidance import (
    ASYMPTOTIC_MODE_COUNT_MIN_V,
    LP11_CUTOFF_V,
    GuidanceModelManifest,
    GuidanceRequest,
    GuidanceResult,
    GuidanceWarning,
    GuidanceWarningCode,
    ModeRegime,
    calculate_guidance,
    numerical_aperture,
    v_number,
)

MODE_COUNT_WARNING = GuidanceWarningCode.MODE_COUNT_UNAVAILABLE
AIR_WARNING = GuidanceWarningCode.AIR_ACCEPTANCE_ANGLE_UNAVAILABLE


def make_request(
    n_core: float,
    n_cladding: float,
    core_radius_um: float = 4.1,
    wavelength_nm: float = 1550.0,
) -> GuidanceRequest:
    return GuidanceRequest(
        n_core=n_core,
        n_cladding=n_cladding,
        core_radius_um=core_radius_um,
        wavelength_nm=wavelength_nm,
    )


def valid_values() -> dict[str, float]:
    return {
        "n_core": 1.5,
        "n_cladding": 1.45,
        "core_radius_um": 4.1,
        "wavelength_nm": 1550.0,
    }


def request_for_v(target_v: float, side: Literal["below", "at", "above"]) -> GuidanceRequest:
    n_core = 1.5
    n_cladding = math.sqrt(2.0)
    wavelength_nm = 1000.0
    reference = make_request(n_core, n_cladding, 1.0, wavelength_nm)
    radius_um = target_v * wavelength_nm / (2.0 * math.pi * 1000.0 * numerical_aperture(reference))

    if side == "below":
        radius_um = math.nextafter(radius_um, 0.0)
    else:
        radius_um = math.nextafter(radius_um, math.inf)
        if side == "above":
            for _ in range(8):
                request = make_request(n_core, n_cladding, radius_um, wavelength_nm)
                if v_number(request) > target_v:
                    return request
                radius_um = math.nextafter(radius_um, math.inf)
            raise AssertionError("Could not construct an immediately-above V-number request.")

    return make_request(n_core, n_cladding, radius_um, wavelength_nm)


def warning_codes(result: GuidanceResult) -> tuple[GuidanceWarningCode, ...]:
    return tuple(warning.code for warning in result.warnings)


def test_aggregate_accepts_exact_unit_numerical_aperture() -> None:
    result = calculate_guidance(make_request(1.25, 0.75, 1.0, 1000.0))

    assert result.numerical_aperture_dimensionless == 1.0
    assert result.air_acceptance_angle_deg == 90.0
    assert AIR_WARNING not in warning_codes(result)
    assert warning_codes(result) == (MODE_COUNT_WARNING,)


@pytest.mark.parametrize(
    ("side", "expected_regime"),
    [
        ("below", ModeRegime.SINGLE_MODE),
        ("at", ModeRegime.MULTIMODE),
        ("above", ModeRegime.MULTIMODE),
    ],
    ids=["immediately-below", "at-cutoff", "immediately-above"],
)
def test_aggregate_mode_regime_boundary_vectors(
    side: Literal["below", "at", "above"], expected_regime: ModeRegime
) -> None:
    request = request_for_v(LP11_CUTOFF_V, side)
    result = calculate_guidance(request)
    actual_v = result.v_number_dimensionless

    assert actual_v == pytest.approx(LP11_CUTOFF_V, rel=0.0, abs=1e-12)
    if side == "below":
        assert actual_v < LP11_CUTOFF_V
    else:
        assert actual_v >= LP11_CUTOFF_V
    assert result.mode_regime is expected_regime
    assert result.approximate_mode_count is None
    assert result.air_acceptance_angle_deg is not None
    assert warning_codes(result) == (MODE_COUNT_WARNING,)


@pytest.mark.parametrize(
    "side",
    ["below", "at", "above"],
    ids=["immediately-below", "at-threshold", "immediately-above"],
)
def test_aggregate_mode_count_boundary_vectors(side: Literal["below", "at", "above"]) -> None:
    request = request_for_v(ASYMPTOTIC_MODE_COUNT_MIN_V, side)
    result = calculate_guidance(request)
    actual_v = result.v_number_dimensionless

    assert actual_v == pytest.approx(ASYMPTOTIC_MODE_COUNT_MIN_V, rel=0.0, abs=1e-12)
    assert result.mode_regime is ModeRegime.MULTIMODE
    assert result.air_acceptance_angle_deg is not None
    assert AIR_WARNING not in warning_codes(result)

    if side == "below":
        assert actual_v < ASYMPTOTIC_MODE_COUNT_MIN_V
        assert result.approximate_mode_count is None
        assert warning_codes(result) == (MODE_COUNT_WARNING,)
    else:
        assert actual_v >= ASYMPTOTIC_MODE_COUNT_MIN_V
        assert result.approximate_mode_count is not None
        assert math.isfinite(result.approximate_mode_count)
        if side == "at":
            assert result.approximate_mode_count == pytest.approx(50.0, rel=0.0, abs=1e-12)
        else:
            assert result.approximate_mode_count > 50.0
        assert warning_codes(result) == ()


def test_invalid_guidance_requests_are_rejected_before_aggregation() -> None:
    values = valid_values()
    values["n_core"] = values["n_cladding"]

    with pytest.raises(ValidationError):
        request = GuidanceRequest(**values)
        calculate_guidance(request)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("core_radius_um", 0.0),
        ("core_radius_um", -1.0),
        ("wavelength_nm", 0.0),
        ("wavelength_nm", -1.0),
    ],
    ids=["zero-radius", "negative-radius", "zero-wavelength", "negative-wavelength"],
)
def test_non_positive_dimensions_are_rejected_before_aggregation(field: str, value: float) -> None:
    values = valid_values()
    values[field] = value

    with pytest.raises(ValidationError):
        request = GuidanceRequest(**values)
        calculate_guidance(request)


@pytest.mark.parametrize("submodel_name", ["air_acceptance_angle_deg", "approximate_mode_count"])
def test_aggregate_propagates_unrelated_submodel_errors(
    monkeypatch: pytest.MonkeyPatch, submodel_name: str
) -> None:
    def raise_unrelated_error(_: GuidanceRequest) -> float:
        raise RuntimeError("unrelated submodel failure")

    monkeypatch.setattr(result_module, submodel_name, raise_unrelated_error)

    with pytest.raises(RuntimeError, match="unrelated submodel failure"):
        calculate_guidance(make_request(1.5, math.sqrt(2.0), 1.0, 1000.0))


def test_guidance_json_schema_closes_models_and_requires_non_nullable_fields() -> None:
    schema = GuidanceResult.model_json_schema()
    definitions = schema["$defs"]

    assert schema["additionalProperties"] is False
    assert definitions["GuidanceWarning"]["additionalProperties"] is False
    assert definitions["GuidanceModelManifest"]["additionalProperties"] is False

    assert set(schema["properties"]) == set(GuidanceResult.model_fields)
    assert set(schema["required"]) == {
        name for name, field in GuidanceResult.model_fields.items() if field.is_required()
    }
    assert set(definitions["GuidanceWarning"]["properties"]) == set(GuidanceWarning.model_fields)
    assert set(definitions["GuidanceWarning"]["required"]) == {
        name for name, field in GuidanceWarning.model_fields.items() if field.is_required()
    }
    assert set(definitions["GuidanceModelManifest"]["properties"]) == set(
        GuidanceModelManifest.model_fields
    )
    assert set(definitions["GuidanceModelManifest"].get("required", ())) == {
        name for name, field in GuidanceModelManifest.model_fields.items() if field.is_required()
    }


def test_guidance_json_schema_has_numeric_and_nullable_outputs() -> None:
    schema = GuidanceResult.model_json_schema()
    numeric_fields = (
        "critical_angle_deg",
        "numerical_aperture_dimensionless",
        "air_acceptance_angle_deg",
        "relative_index_difference_dimensionless",
        "v_number_dimensionless",
        "approximate_mode_count",
    )
    nullable_fields = {"air_acceptance_angle_deg", "approximate_mode_count"}

    for field_name in numeric_fields:
        field_schema = schema["properties"][field_name]
        if field_name in nullable_fields:
            assert field_schema["anyOf"] == [{"type": "number"}, {"type": "null"}]
        else:
            assert field_schema["type"] == "number"

    manifest_schema = schema["$defs"]["GuidanceModelManifest"]
    for field_name in ("mode_regime_cutoff_v_dimensionless", "mode_count_min_v_dimensionless"):
        assert manifest_schema["properties"][field_name]["type"] == "number"


def test_guidance_json_schema_has_exact_warning_enum_values() -> None:
    schema = GuidanceResult.model_json_schema()

    assert schema["$defs"]["GuidanceWarningCode"]["enum"] == [
        "air_acceptance_angle_unavailable",
        "mode_count_unavailable",
    ]
    assert schema["$defs"]["GuidanceWarning"]["properties"]["output_field"]["enum"] == [
        "air_acceptance_angle_deg",
        "approximate_mode_count",
    ]
