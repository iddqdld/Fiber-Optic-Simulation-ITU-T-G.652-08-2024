import json
import math

import pytest
from pydantic import ValidationError

from fibre_sim.standards import (
    G652DAttenuationApplication,
    G652DAttenuationCheckManifest,
    G652DAttenuationCheckRequest,
    G652DAttenuationCheckResult,
    G652DAttenuationCheckStatus,
    G652DAttenuationLimitBand,
    check_g652d_attenuation,
)


def make_request(**overrides: object) -> G652DAttenuationCheckRequest:
    values: dict[str, object] = {
        "wavelength_nm": 1550.0,
        "attenuation_db_per_km": 0.275,
        "cable_application": G652DAttenuationApplication.STANDARD_CABLE,
    }
    values.update(overrides)
    return G652DAttenuationCheckRequest.model_validate(values)


def test_enums_and_manifest_are_source_stable() -> None:
    assert [application.value for application in G652DAttenuationApplication] == [
        "standard_cable",
        "short_jumper",
        "indoor_cable",
        "drop_cable",
    ]
    assert [band.value for band in G652DAttenuationLimitBand] == [
        "general_1310_1625",
        "c_band_1530_1565",
    ]
    assert [status.value for status in G652DAttenuationCheckStatus] == [
        "pass",
        "fail_above_maximum",
        "not_applicable",
    ]

    manifest = G652DAttenuationCheckManifest()
    assert manifest.standard_name == "ITU-T G.652"
    assert manifest.standard_edition == "08/2024"
    assert manifest.fibre_category == "G.652.D"
    assert manifest.comparison_rule == "inclusive_maximum"
    text = " ".join(manifest.assumptions + manifest.limitations).lower()
    for phrase in (
        "same wavelength",
        "c-band",
        "short jumpers",
        "indoor cables",
        "drop cables",
        "1260-1310",
        "+0.07",
        "hydrogen",
        "type test",
        "not full g.652.d conformance",
    ):
        assert phrase in text


@pytest.mark.parametrize("wavelength_nm", [1310.0, 1625.0])
def test_general_band_passes_inclusively(wavelength_nm: float) -> None:
    result = check_g652d_attenuation(
        make_request(wavelength_nm=wavelength_nm, attenuation_db_per_km=0.4)
    )

    assert result.limit_band is G652DAttenuationLimitBand.GENERAL_1310_1625
    assert result.maximum_attenuation_db_per_km == 0.4
    assert result.margin_below_maximum_db_per_km == 0.0
    assert math.copysign(1.0, result.margin_below_maximum_db_per_km) == 1.0
    assert result.status is G652DAttenuationCheckStatus.PASS
    assert result.not_applicable_reason is None


@pytest.mark.parametrize("wavelength_nm", [1530.0, 1565.0])
def test_c_band_override_is_inclusive(wavelength_nm: float) -> None:
    result = check_g652d_attenuation(
        make_request(wavelength_nm=wavelength_nm, attenuation_db_per_km=0.3)
    )

    assert result.limit_band is G652DAttenuationLimitBand.C_BAND_1530_1565
    assert result.maximum_attenuation_db_per_km == 0.3
    assert result.status is G652DAttenuationCheckStatus.PASS


def test_above_maximum_fails_with_signed_margin() -> None:
    result = check_g652d_attenuation(make_request(attenuation_db_per_km=0.3000001))

    assert result.status is G652DAttenuationCheckStatus.FAIL_ABOVE_MAXIMUM
    assert result.margin_below_maximum_db_per_km == pytest.approx(-0.0000001)


@pytest.mark.parametrize(
    "application",
    [
        G652DAttenuationApplication.SHORT_JUMPER,
        G652DAttenuationApplication.INDOOR_CABLE,
        G652DAttenuationApplication.DROP_CABLE,
    ],
)
def test_non_standard_applications_are_not_applicable(
    application: G652DAttenuationApplication,
) -> None:
    result = check_g652d_attenuation(make_request(cable_application=application))

    assert result.status is G652DAttenuationCheckStatus.NOT_APPLICABLE
    assert result.limit_band is None
    assert result.maximum_attenuation_db_per_km is None
    assert result.margin_below_maximum_db_per_km is None
    assert result.not_applicable_reason


def test_lower_wavelength_is_not_inferred_from_extension_note() -> None:
    result = check_g652d_attenuation(make_request(wavelength_nm=1260.0))

    assert result.status is G652DAttenuationCheckStatus.NOT_APPLICABLE
    reason = result.not_applicable_reason
    assert reason is not None
    assert "1310" in reason
    assert result.model_manifest == G652DAttenuationCheckManifest()


def test_request_and_result_are_strict_finite_frozen_and_extra_forbid() -> None:
    for field in ("wavelength_nm", "attenuation_db_per_km"):
        for value in (math.nan, math.inf, -math.inf):
            with pytest.raises(ValidationError) as exc_info:
                make_request(**{field: value})
            assert exc_info.value.errors()[0]["type"] == "finite_number"

    with pytest.raises(ValidationError) as exc_info:
        make_request(attenuation_db_per_km=True)
    assert exc_info.value.errors()[0]["type"] == "float_type"

    values = make_request().model_dump()
    values["unexpected"] = "forbidden"
    with pytest.raises(ValidationError) as exc_info:
        G652DAttenuationCheckRequest.model_validate(values)
    assert exc_info.value.errors()[0]["type"] == "extra_forbidden"

    request = make_request()
    with pytest.raises(ValidationError) as exc_info:
        request.wavelength_nm = 1310.0
    assert exc_info.value.errors()[0]["type"] == "frozen_instance"


def test_result_status_shape_errors_are_stable() -> None:
    common = {
        "wavelength_nm": 1550.0,
        "supplied_attenuation_db_per_km": 0.2,
        "cable_application": G652DAttenuationApplication.STANDARD_CABLE,
        "model_manifest": G652DAttenuationCheckManifest(),
    }
    with pytest.raises(ValidationError) as exc_info:
        G652DAttenuationCheckResult.model_validate(
            {**common, "status": G652DAttenuationCheckStatus.NOT_APPLICABLE}
        )
    assert exc_info.value.errors()[0]["type"] == "attenuation_not_applicable_reason_required"

    with pytest.raises(ValidationError) as exc_info:
        G652DAttenuationCheckResult.model_validate(
            {
                **common,
                "status": G652DAttenuationCheckStatus.NOT_APPLICABLE,
                "not_applicable_reason": " ",
            }
        )
    assert exc_info.value.errors()[0]["type"] == "attenuation_not_applicable_reason_required"

    with pytest.raises(ValidationError) as exc_info:
        G652DAttenuationCheckResult.model_validate(
            {
                **common,
                "status": G652DAttenuationCheckStatus.NOT_APPLICABLE,
                "not_applicable_reason": "outside scope",
                "limit_band": G652DAttenuationLimitBand.C_BAND_1530_1565,
            }
        )
    assert (
        exc_info.value.errors()[0]["type"]
        == "attenuation_not_applicable_comparison_fields_forbidden"
    )

    with pytest.raises(ValidationError) as exc_info:
        G652DAttenuationCheckResult.model_validate(
            {**common, "status": G652DAttenuationCheckStatus.PASS}
        )
    assert exc_info.value.errors()[0]["type"] == "attenuation_comparison_fields_required"

    with pytest.raises(ValidationError) as exc_info:
        G652DAttenuationCheckResult.model_validate(
            {
                **common,
                "status": G652DAttenuationCheckStatus.PASS,
                "limit_band": G652DAttenuationLimitBand.C_BAND_1530_1565,
                "maximum_attenuation_db_per_km": 0.3,
                "margin_below_maximum_db_per_km": 0.1,
                "not_applicable_reason": "unexpected",
            }
        )
    assert exc_info.value.errors()[0]["type"] == "attenuation_not_applicable_reason_forbidden"


def test_results_serialize_deterministically_as_json() -> None:
    first = check_g652d_attenuation(make_request())
    second = check_g652d_attenuation(make_request())

    assert first == second
    assert first.model_dump_json() == second.model_dump_json()
    assert json.loads(first.model_dump_json()) == first.model_dump(mode="json")
