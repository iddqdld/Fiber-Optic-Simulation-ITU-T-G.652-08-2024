import json
import math

import pytest
from pydantic import ValidationError

from fibre_sim.standards import (
    G652DDispersionEnvelopeManifest,
    G652DPreset,
    G652DSimulationDefaults,
    G652DStandardLimits,
    get_g652d_preset,
)


def test_standard_limits_encode_table_2_exact_values() -> None:
    limits = G652DStandardLimits()

    assert limits.mode_field_diameter_reference_wavelength_nm == 1310.0
    assert limits.mode_field_diameter_nominal_min_um == 8.6
    assert limits.mode_field_diameter_nominal_max_um == 9.2
    assert limits.mode_field_diameter_tolerance_um == 0.4
    assert limits.cladding_diameter_nominal_um == 125.0
    assert limits.cladding_diameter_tolerance_um == 0.7
    assert limits.core_concentricity_error_max_um == 0.6
    assert limits.cladding_non_circularity_max_percent == 1.0
    assert limits.cable_cutoff_wavelength_max_nm == 1260.0
    assert (
        limits.macrobend_radius_mm,
        limits.macrobend_turns,
        limits.macrobend_wavelength_nm,
        limits.macrobend_max_loss_db,
    ) == (30.0, 100, 1625.0, 0.1)
    assert limits.proof_stress_min_gpa == 0.69
    assert type(limits.macrobend_turns) is int
    assert type(limits.pmd_sample_cable_count) is int
    assert limits.dispersion_envelope_manifest == G652DDispersionEnvelopeManifest()
    assert (
        limits.attenuation_general_min_wavelength_nm,
        limits.attenuation_general_max_wavelength_nm,
        limits.attenuation_general_max_db_per_km,
    ) == (1310.0, 1625.0, 0.4)
    assert (
        limits.attenuation_hydrogen_aged_center_wavelength_nm,
        limits.attenuation_hydrogen_aged_tolerance_nm,
        limits.attenuation_hydrogen_aged_max_db_per_km,
    ) == (1383.0, 3.0, 0.4)
    assert (
        limits.attenuation_c_band_min_wavelength_nm,
        limits.attenuation_c_band_max_wavelength_nm,
        limits.attenuation_c_band_max_db_per_km,
    ) == (1530.0, 1565.0, 0.3)
    assert (
        limits.pmd_sample_cable_count,
        limits.pmd_exceedance_probability_percent,
        limits.pmd_max_ps_per_sqrt_km,
    ) == (
        20,
        0.01,
        0.2,
    )
    assert limits.source_reference == "ITU-T G.652 (08/2024), Table 2"


def test_simulation_defaults_are_separate_informative_values() -> None:
    defaults = G652DSimulationDefaults()

    assert (
        defaults.reference_wavelength_nm,
        defaults.attenuation_db_per_km,
        defaults.dispersion_ps_per_nm_km,
    ) == (1550.0, 0.275, 17.0)
    assert defaults.source_reference == "ITU-T G.652 (08/2024), Appendix I, Table I.1"
    assert defaults.default_kind == "informative_design_example"
    limitations = " ".join(defaults.limitations).lower()
    assert "not normative limits" in limitations
    assert "product guarantee" in limitations
    assert "core radius" in limitations
    assert "indices" in limitations
    assert "group index" in limitations
    assert defaults.attenuation_db_per_km != G652DStandardLimits().attenuation_general_max_db_per_km


def test_preset_metadata_sources_and_fresh_nested_values_are_deterministic() -> None:
    first = get_g652d_preset()
    second = get_g652d_preset()

    assert type(first) is G652DPreset
    assert first.preset_id == "g652d_2024"
    assert first.model_id == "itu_t_g652d_preset"
    assert first.model_version == "1.0.0"
    assert first.standard_name == "ITU-T G.652"
    assert first.standard_edition == "08/2024"
    assert first.fibre_category == "G.652.D"
    assert first.source_references == (
        "ITU-T G.652 (08/2024), Table 2",
        "ITU-T G.652 (08/2024), Appendix I, Table I.1",
    )
    limitations = " ".join(first.limitations).lower()
    assert "not a direct measured-value envelope" in limitations
    assert "qualification condition" in limitations
    assert "pmd value is statistical" in limitations
    assert first == second
    assert first is not second
    assert first.limits is not second.limits
    assert first.simulation_defaults is not second.simulation_defaults
    assert (
        first.limits.dispersion_envelope_manifest is not second.limits.dispersion_envelope_manifest
    )
    assert id(first.limits) != id(first.simulation_defaults)
    assert first.model_dump() == second.model_dump()
    assert first.model_dump_json() == second.model_dump_json()
    assert json.loads(first.model_dump_json()) == first.model_dump(mode="json")


@pytest.mark.parametrize(
    ("model", "field", "value"),
    [
        (G652DStandardLimits, "mode_field_diameter_reference_wavelength_nm", math.inf),
        (G652DStandardLimits, "attenuation_general_max_db_per_km", -0.1),
        (G652DStandardLimits, "cladding_non_circularity_max_percent", 100.1),
        (G652DStandardLimits, "macrobend_turns", 100.0),
        (G652DStandardLimits, "pmd_sample_cable_count", True),
        (G652DSimulationDefaults, "reference_wavelength_nm", 1259.0),
        (G652DSimulationDefaults, "attenuation_db_per_km", math.nan),
    ],
)
def test_preset_models_validate_numeric_domains(
    model: type[object], field: str, value: object
) -> None:
    with pytest.raises(ValidationError):
        model.model_validate({field: value})  # type: ignore[attr-defined]


def test_preset_models_reject_reversed_ranges_extras_and_mutation() -> None:
    with pytest.raises(ValidationError) as exc_info:
        G652DStandardLimits.model_validate(
            {
                "mode_field_diameter_nominal_min_um": 10.0,
                "mode_field_diameter_nominal_max_um": 9.0,
            }
        )
    assert exc_info.value.errors()[0]["type"] == "g652d_mfd_nominal_range_reversed"

    values = G652DSimulationDefaults().model_dump()
    values["unexpected"] = "forbidden"
    with pytest.raises(ValidationError) as exc_info:
        G652DSimulationDefaults.model_validate(values)
    assert exc_info.value.errors()[0]["type"] == "extra_forbidden"

    limits = G652DStandardLimits()
    with pytest.raises(ValidationError) as exc_info:
        limits.pmd_sample_cable_count = 21
    assert exc_info.value.errors()[0]["type"] == "frozen_instance"
