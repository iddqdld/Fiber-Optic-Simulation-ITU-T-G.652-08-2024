from typing import Any, get_args

import pytest
from apps.api.app import main
from apps.api.app.schemas import (
    CableSection,
    Connector,
    FibreDefinition,
    FibreStandard,
    IndexProfile,
    LinkComponent,
    ModelReference,
    SourceDefinition,
    SourceType,
    Splice,
)
from apps.api.app.schemas.base import DIMENSIONLESS_NUMERIC_FIELDS, PHYSICAL_UNIT_SUFFIXES
from pydantic import TypeAdapter, ValidationError

from fibre_sim.guidance import GuidanceRequest
from fibre_sim.level1 import (
    Level1FibreConfig,
    Level1SamplingConfig,
    Level1SectionConfig,
    Level1SimulationManifest,
    Level1SimulationRequest,
    Level1SimulationResult,
    Level1SourceConfig,
    Level1StandardsChecks,
    Level1Warning,
)


def fibre() -> FibreDefinition:
    return FibreDefinition(
        name="G.652.D",
        standard_category=FibreStandard.G652D,
        core_radius_um=4.1,
        cladding_diameter_um=125.0,
        n_core_model=ModelReference(model_id="n-core"),
        n_cladding_model=ModelReference(model_id="n-cladding"),
        index_profile=IndexProfile.STEP,
        mode_field_diameter_model=ModelReference(model_id="mode-field"),
        cutoff_wavelength_nm=1260.0,
        attenuation_model_id="attenuation-g652d",
        dispersion_model_id="dispersion-g652d",
        pmd_coefficient_ps_sqrt_km=0.1,
        effective_area_um2=80.0,
        metadata={"source": "standard"},
    )


def source() -> SourceDefinition:
    return SourceDefinition(
        wavelength_nm=1550.0,
        input_power_dbm=0.0,
        source_type=SourceType.CW,
        spectral_width_nm=0.1,
        beam_waist_um=5.0,
        launch_offset_um=0.0,
        launch_angle_deg=0.0,
        polarization="linear-x",
    )


def test_fibre_serialization_uses_planned_names_and_enum_values() -> None:
    payload = fibre().model_dump(mode="json")

    assert payload["standard_category"] == "G652D"
    assert payload["index_profile"] == "STEP"
    assert payload["core_radius_um"] == 4.1
    assert payload["effective_area_um2"] == 80.0
    assert "core_radius" not in payload
    assert "standard" not in payload


def test_cable_section_requires_exactly_one_fibre_selection() -> None:
    with pytest.raises(ValidationError):
        CableSection(length_km=1.0)

    with pytest.raises(ValidationError):
        CableSection(length_km=1.0, fibre_definition_id="fibre-1", fibre_definition=fibre())

    by_id = CableSection(length_km=1.0, fibre_definition_id="fibre-1")
    embedded = CableSection(length_km=1.0, fibre_definition=fibre())

    assert by_id.fibre_definition_id == "fibre-1"
    assert embedded.fibre_definition == fibre()


def test_payload_models_reject_extra_and_unlabelled_fields() -> None:
    payload = fibre().model_dump()
    payload["core_radius"] = 4.1
    with pytest.raises(ValidationError):
        FibreDefinition.model_validate(payload)

    source_payload = source().model_dump()
    source_payload["unexpected"] = "value"
    with pytest.raises(ValidationError):
        SourceDefinition.model_validate(source_payload)


def test_link_component_uses_component_type_discriminator() -> None:
    adapter: TypeAdapter[LinkComponent] = TypeAdapter(LinkComponent)

    splice = adapter.validate_python(
        {"component_type": "splice", "location_km": 2.0, "loss_db": 0.1}
    )
    connector = adapter.validate_python(
        {
            "component_type": "connector",
            "location_km": 3.0,
            "loss_db": 0.4,
            "return_loss_db": 50.0,
        }
    )

    assert isinstance(splice, Splice)
    assert isinstance(connector, Connector)

    with pytest.raises(ValidationError):
        adapter.validate_python({"component_type": "splitter", "location_km": 1.0})


def test_source_serialization_preserves_source_type_and_planned_fields() -> None:
    payload = source().model_dump(mode="json")

    assert payload["source_type"] == "CW"
    assert payload["input_power_dbm"] == 0.0
    assert "pulse_shape" not in payload


def test_result_contract_has_typed_explicit_series_without_generic_metrics() -> None:
    from apps.api.app.schemas import SimulationResult

    fields = SimulationResult.model_fields

    assert {
        "summary",
        "per_section_results",
        "distance_series",
        "wavelength_series",
        "pulse_series",
        "field_cross_section",
        "warnings",
        "standards_checks",
        "model_manifest",
    }.issubset(fields)
    assert "value" not in fields
    assert "metrics" not in fields


def test_guidance_request_requires_exact_fields_and_rejects_extras() -> None:
    payload = {
        "n_core": 1.45,
        "n_cladding": 1.44,
        "core_radius_um": 4.1,
        "wavelength_nm": 1550.0,
    }

    assert set(GuidanceRequest.model_fields) == set(payload)
    assert GuidanceRequest.model_validate(payload).model_dump() == payload

    with pytest.raises(ValidationError):
        GuidanceRequest.model_validate({**payload, "unexpected": "value"})

    for field_name in payload:
        incomplete_payload = payload.copy()
        del incomplete_payload[field_name]
        with pytest.raises(ValidationError):
            GuidanceRequest.model_validate(incomplete_payload)


def contains_numeric_annotation(annotation: Any) -> bool:
    if annotation is bool:
        return False
    if annotation in (int, float):
        return True
    return any(contains_numeric_annotation(argument) for argument in get_args(annotation))


def test_numeric_contract_fields_use_explicit_units_or_dimensionless_names() -> None:
    violations: list[str] = []

    for model in main.CONTRACT_MODELS:
        for field_name, field in model.model_fields.items():
            if not contains_numeric_annotation(field.annotation):
                continue
            has_unit_suffix = any(field_name.endswith(suffix) for suffix in PHYSICAL_UNIT_SUFFIXES)
            is_dimensionless = field_name in DIMENSIONLESS_NUMERIC_FIELDS or field_name.endswith(
                "_dimensionless"
            )
            if not has_unit_suffix and not is_dimensionless:
                violations.append(f"{model.__name__}.{field_name}")

    assert violations == []


def test_level1_models_are_registered_and_unit_checked() -> None:
    level1_models = (
        Level1FibreConfig,
        Level1SourceConfig,
        Level1SectionConfig,
        Level1SamplingConfig,
        Level1SimulationRequest,
        Level1StandardsChecks,
        Level1Warning,
        Level1SimulationManifest,
        Level1SimulationResult,
    )

    assert set(level1_models).issubset(set(main.CONTRACT_MODELS))

    violations: list[str] = []
    for model in level1_models:
        for field_name, field in model.model_fields.items():
            if not contains_numeric_annotation(field.annotation):
                continue
            has_unit_suffix = any(field_name.endswith(suffix) for suffix in PHYSICAL_UNIT_SUFFIXES)
            is_dimensionless = field_name in DIMENSIONLESS_NUMERIC_FIELDS or field_name.endswith(
                "_dimensionless"
            )
            if not has_unit_suffix and not is_dimensionless:
                violations.append(f"{model.__name__}.{field_name}")

    assert violations == []
