import json
import math

import pytest
from pydantic import ValidationError

from fibre_sim.guidance import (
    GuidanceModelManifest,
    GuidanceRequest,
    GuidanceResult,
    GuidanceWarning,
    GuidanceWarningCode,
    ModeRegime,
    calculate_guidance,
    numerical_aperture,
)

MODE_COUNT_VALIDITY_MESSAGE = (
    "V^2/2 estimate requires V >= 10.0 under the project validity policy "
    "(clearly highly multimode regime)."
)
AIR_ACCEPTANCE_ANGLE_MESSAGE = (
    "Inverse-sine air acceptance-angle model requires numerical aperture <= 1."
)


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


def request_for_v(target_v: float) -> GuidanceRequest:
    n_core = 1.5
    n_cladding = math.sqrt(2.0)
    wavelength_nm = 1550.0
    na = math.sqrt(n_core**2 - n_cladding**2)
    radius_um = target_v * wavelength_nm / (2.0 * math.pi * 1000.0 * na)
    return make_request(n_core, n_cladding, radius_um, wavelength_nm)


def test_guidance_models_reject_extras_and_are_frozen() -> None:
    result = calculate_guidance(make_request(1.450, 1.444))
    models = (result.warnings[0], result.model_manifest, result)

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


def test_warning_code_values_are_stable() -> None:
    assert [code.value for code in GuidanceWarningCode] == [
        "air_acceptance_angle_unavailable",
        "mode_count_unavailable",
    ]


def test_educational_low_v_result_preserves_steps_10_to_12_and_warns_on_mode_count() -> None:
    request = make_request(1.450, 1.444, 4.1, 1550.0)
    result = calculate_guidance(request)

    assert result.critical_angle_deg == pytest.approx(84.78590277783555, rel=1e-12)
    assert result.numerical_aperture_dimensionless == pytest.approx(0.13177253128023367, rel=1e-12)
    assert result.air_acceptance_angle_deg == pytest.approx(7.572032141901201, rel=1e-12)
    assert result.relative_index_difference_dimensionless == pytest.approx(
        0.004137931034482762, rel=1e-12
    )
    assert result.v_number_dimensionless == pytest.approx(2.19006455, rel=0.0, abs=5e-9)
    assert result.mode_regime is ModeRegime.SINGLE_MODE
    assert result.approximate_mode_count is None

    assert len(result.warnings) == 1
    warning = result.warnings[0]
    assert warning.code is GuidanceWarningCode.MODE_COUNT_UNAVAILABLE
    assert warning.message == MODE_COUNT_VALIDITY_MESSAGE
    assert warning.output_field == "approximate_mode_count"


def test_high_v_result_has_finite_unrounded_mode_count_and_no_warnings() -> None:
    result = calculate_guidance(request_for_v(10.1))

    assert result.numerical_aperture_dimensionless <= 1.0
    assert result.v_number_dimensionless == pytest.approx(10.1, rel=0.0, abs=1e-12)
    assert result.air_acceptance_angle_deg is not None
    assert result.approximate_mode_count is not None
    assert math.isfinite(result.approximate_mode_count)
    assert result.approximate_mode_count == pytest.approx(51.005, rel=0.0, abs=1e-11)
    assert not result.approximate_mode_count.is_integer()
    assert result.warnings == ()


def test_na_above_one_nulls_only_air_acceptance_angle_and_warns_by_field() -> None:
    request = make_request(2.0, 1.0, 4.1, 1550.0)
    result = calculate_guidance(request)

    assert result.numerical_aperture_dimensionless > 1.0
    assert result.air_acceptance_angle_deg is None
    assert math.isfinite(result.critical_angle_deg)
    assert math.isfinite(result.numerical_aperture_dimensionless)
    assert math.isfinite(result.relative_index_difference_dimensionless)
    assert math.isfinite(result.v_number_dimensionless)
    assert result.approximate_mode_count is not None
    assert math.isfinite(result.approximate_mode_count)
    assert len(result.warnings) == 1
    warning = result.warnings[0]
    assert warning.code is GuidanceWarningCode.AIR_ACCEPTANCE_ANGLE_UNAVAILABLE
    assert warning.message == AIR_ACCEPTANCE_ANGLE_MESSAGE
    assert warning.output_field == "air_acceptance_angle_deg"


def test_both_invalid_submodels_have_stable_air_then_mode_warning_order() -> None:
    result = calculate_guidance(make_request(2.0, 1.0, 1.0, 1550.0))

    assert result.v_number_dimensionless < 10.0
    assert result.air_acceptance_angle_deg is None
    assert result.approximate_mode_count is None
    assert len(result.warnings) == 2
    assert result.warnings[0].code is GuidanceWarningCode.AIR_ACCEPTANCE_ANGLE_UNAVAILABLE
    assert result.warnings[1].code is GuidanceWarningCode.MODE_COUNT_UNAVAILABLE
    assert [warning.output_field for warning in result.warnings] == [
        "air_acceptance_angle_deg",
        "approximate_mode_count",
    ]
    assert [warning.message for warning in result.warnings] == [
        AIR_ACCEPTANCE_ANGLE_MESSAGE,
        MODE_COUNT_VALIDITY_MESSAGE,
    ]


def test_manifest_has_stable_thresholds_assumptions_and_limitations() -> None:
    manifest = calculate_guidance(make_request(1.450, 1.444)).model_manifest
    second_manifest = calculate_guidance(make_request(1.450, 1.444)).model_manifest

    assert manifest == second_manifest
    assert manifest.model_id == "ideal_circular_step_index_guidance"
    assert manifest.model_version == "1.0.0"
    assert manifest.mode_regime_cutoff_v_dimensionless == 2.405
    assert manifest.mode_count_min_v_dimensionless == 10.0
    assert manifest.assumptions
    assert manifest.limitations

    manifest_text = " ".join((*manifest.assumptions, *manifest.limitations)).lower()
    assert "ideal" in manifest_text
    assert "step-index" in manifest_text
    assert "g.652.d" in manifest_text
    assert "conformance" in manifest_text
    assert "measured" in manifest_text
    assert "cut-off" in manifest_text or "cutoff" in manifest_text
    assert "distinct" in manifest_text
    assert "not" in manifest_text


def test_guidance_result_has_explicit_deterministic_json_contract() -> None:
    request = request_for_v(10.1)
    first = calculate_guidance(request)
    second = calculate_guidance(request)
    expected_fields = {
        "critical_angle_deg",
        "numerical_aperture_dimensionless",
        "air_acceptance_angle_deg",
        "relative_index_difference_dimensionless",
        "v_number_dimensionless",
        "mode_regime",
        "approximate_mode_count",
        "warnings",
        "model_manifest",
    }

    assert set(GuidanceWarning.model_fields) == {"code", "message", "output_field"}
    assert [code.value for code in GuidanceWarningCode] == [
        "air_acceptance_angle_unavailable",
        "mode_count_unavailable",
    ]
    assert set(GuidanceModelManifest.model_fields) == {
        "model_id",
        "model_version",
        "mode_regime_cutoff_v_dimensionless",
        "mode_count_min_v_dimensionless",
        "assumptions",
        "limitations",
    }
    assert set(GuidanceResult.model_fields) == expected_fields
    assert set(first.model_dump(mode="json")) == expected_fields
    assert first == second
    assert first.model_dump(mode="json") == second.model_dump(mode="json")
    assert first.model_dump_json() == second.model_dump_json()

    payload = first.model_dump(mode="json")
    assert isinstance(payload["warnings"], list)
    assert isinstance(payload["model_manifest"]["assumptions"], list)
    assert isinstance(payload["model_manifest"]["limitations"], list)
    assert json.loads(first.model_dump_json()) == payload


@pytest.mark.parametrize(
    "field_name",
    [
        "critical_angle_deg",
        "numerical_aperture_dimensionless",
        "air_acceptance_angle_deg",
        "relative_index_difference_dimensionless",
        "v_number_dimensionless",
        "approximate_mode_count",
    ],
)
@pytest.mark.parametrize("non_finite", [math.inf, -math.inf, math.nan])
def test_guidance_result_rejects_non_finite_numeric_outputs(
    field_name: str, non_finite: float
) -> None:
    payload = calculate_guidance(request_for_v(10.1)).model_dump()
    payload[field_name] = non_finite

    with pytest.raises(ValidationError) as exc_info:
        GuidanceResult.model_validate(payload)

    assert exc_info.value.errors()[0]["type"] == "finite_number"


@pytest.mark.parametrize("non_finite", [math.inf, -math.inf, math.nan])
def test_guidance_manifest_rejects_non_finite_thresholds(non_finite: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        GuidanceModelManifest(mode_count_min_v_dimensionless=non_finite)

    assert exc_info.value.errors()[0]["type"] == "finite_number"


def test_manifest_thresholds_match_the_result_contract() -> None:
    result = calculate_guidance(make_request(1.450, 1.444))

    assert result.model_manifest.mode_regime_cutoff_v_dimensionless == 2.405
    assert result.model_manifest.mode_count_min_v_dimensionless == 10.0
    assert (
        result.model_manifest.mode_regime_cutoff_v_dimensionless
        < result.model_manifest.mode_count_min_v_dimensionless
    )
    assert result.v_number_dimensionless < result.model_manifest.mode_count_min_v_dimensionless
    assert result.mode_regime is ModeRegime.SINGLE_MODE
    assert result.numerical_aperture_dimensionless == pytest.approx(
        numerical_aperture(make_request(1.450, 1.444))
    )
