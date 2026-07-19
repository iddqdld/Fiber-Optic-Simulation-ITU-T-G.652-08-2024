from typing import Any

import pytest
from apps.api.app import main


def test_shared_contracts_are_published_in_openapi_components() -> None:
    schemas = main.app.openapi()["components"]["schemas"]

    for name in (
        "CableSection",
        "Connector",
        "DistanceSeries",
        "ErrorResponse",
        "FieldCrossSection",
        "FibreDefinition",
        "GuidanceRequest",
        "HealthResponse",
        "LinkComponent",
        "ModelManifest",
        "PulseSeries",
        "SimulationConfig",
        "SimulationResult",
        "Splice",
        "WavelengthSeries",
    ):
        assert name in schemas

    assert schemas["LinkComponent"]["discriminator"] == {
        "propertyName": "component_type",
        "mapping": {
            "splice": "#/components/schemas/Splice",
            "connector": "#/components/schemas/Connector",
        },
    }
    assert "$defs" not in schemas["SimulationResult"]
    assert "value" not in schemas["SimulationResult"]["properties"]


def test_constant_attenuation_result_publishes_bounded_power_samples() -> None:
    result = main.app.openapi()["components"]["schemas"]["ConstantAttenuationResult"]

    assert result["properties"]["distance_samples_km"] == {
        "items": {"type": "number"},
        "maxItems": 65,
        "minItems": 1,
        "title": "Distance Samples Km",
        "type": "array",
    }
    assert result["properties"]["power_samples_dbm"] == {
        "items": {"type": "number"},
        "maxItems": 65,
        "minItems": 1,
        "title": "Power Samples Dbm",
        "type": "array",
    }
    assert result["required"][-3:] == [
        "distance_samples_km",
        "power_samples_dbm",
        "model_manifest",
    ]


def test_guidance_request_schema_has_exact_required_positive_fields() -> None:
    guidance_schema = main.app.openapi()["components"]["schemas"]["GuidanceRequest"]

    assert set(guidance_schema["properties"]) == {
        "n_core",
        "n_cladding",
        "core_radius_um",
        "wavelength_nm",
    }
    assert guidance_schema["additionalProperties"] is False
    assert set(guidance_schema["required"]) == set(guidance_schema["properties"])

    for field_name in ("core_radius_um", "wavelength_nm"):
        assert guidance_schema["properties"][field_name]["exclusiveMinimum"] == 0


def test_contract_schema_merge_preserves_fastapi_generated_schemas(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def generated_openapi(**_: Any) -> dict[str, Any]:
        return {
            "components": {"schemas": {"FastAPIGenerated": {"type": "object"}}},
            "paths": {},
        }

    monkeypatch.setattr(main, "get_openapi", generated_openapi)
    schema = main.build_openapi_schema(main.app)

    assert "FastAPIGenerated" in schema["components"]["schemas"]
    assert "SimulationResult" in schema["components"]["schemas"]


def test_openapi_schema_is_cached() -> None:
    first = main.app.openapi()
    second = main.app.openapi()

    assert first is second


def test_openapi_and_interactive_docs_are_api_v1_prefixed() -> None:
    assert main.app.openapi_url == "/api/v1/openapi.json"
    assert main.app.docs_url == "/api/v1/docs"
    assert main.app.redoc_url == "/api/v1/redoc"


def test_health_response_model_is_exposed_without_changing_health_payload() -> None:
    assert (
        main.app.openapi()["paths"]["/api/v1/health"]["get"]["responses"]["200"]["content"][
            "application/json"
        ]["schema"]["$ref"]
        == "#/components/schemas/HealthResponse"
    )


def test_guidance_path_has_exact_operation_and_response_contracts() -> None:
    paths = main.app.openapi()["paths"]

    assert set(paths) == {
        "/api/v1/health",
        "/api/v1/guidance/calculate",
        "/api/v1/simulations/preview",
    }
    guidance_path = paths["/api/v1/guidance/calculate"]
    assert set(guidance_path) == {"post"}

    operation = guidance_path["post"]
    assert operation["operationId"] == "calculate_guidance"
    assert (
        operation["requestBody"]["content"]["application/json"]["schema"]["$ref"]
        == "#/components/schemas/GuidanceRequest"
    )
    assert set(operation["responses"]) == {"200", "422"}
    assert (
        operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
        == "#/components/schemas/GuidanceResult"
    )
    assert (
        operation["responses"]["422"]["content"]["application/json"]["schema"]["$ref"]
        == "#/components/schemas/ErrorResponse"
    )


def test_level1_preview_path_has_exact_operation_and_response_contracts() -> None:
    preview_path = main.app.openapi()["paths"]["/api/v1/simulations/preview"]

    assert set(preview_path) == {"post"}
    operation = preview_path["post"]
    assert operation["operationId"] == "preview_level1_simulation"
    assert (
        operation["requestBody"]["content"]["application/json"]["schema"]["$ref"]
        == "#/components/schemas/Level1SimulationRequest"
    )
    assert set(operation["responses"]) == {"200", "422"}
    assert (
        operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
        == "#/components/schemas/Level1SimulationResult"
    )
    assert (
        operation["responses"]["422"]["content"]["application/json"]["schema"]["$ref"]
        == "#/components/schemas/ErrorResponse"
    )
    assert operation["responses"]["422"]["description"] == (
        "Request validation or calculation failed"
    )


def test_level1_component_schemas_are_closed_and_reference_nested_contracts() -> None:
    schemas = main.app.openapi()["components"]["schemas"]

    for name in (
        "Level1SimulationRequest",
        "Level1FibreConfig",
        "Level1SourceConfig",
        "Level1SectionConfig",
        "Level1SamplingConfig",
        "Level1SimulationResult",
        "Level1StandardsChecks",
        "Level1Warning",
        "Level1SimulationManifest",
    ):
        assert schemas[name]["additionalProperties"] is False

    request = schemas["Level1SimulationRequest"]
    assert set(request["properties"]) == {
        "preset",
        "fibre",
        "source",
        "section",
        "sampling",
    }
    assert set(request["required"]) == set(request["properties"])
    assert request["properties"]["fibre"] == {"$ref": "#/components/schemas/Level1FibreConfig"}
    assert request["properties"]["source"] == {"$ref": "#/components/schemas/Level1SourceConfig"}
    assert request["properties"]["section"] == {"$ref": "#/components/schemas/Level1SectionConfig"}
    assert request["properties"]["sampling"] == {
        "$ref": "#/components/schemas/Level1SamplingConfig"
    }

    fibre = schemas["Level1FibreConfig"]
    assert fibre["properties"]["cable_application"] == {
        "$ref": "#/components/schemas/G652DAttenuationApplication"
    }
    assert schemas["Level1FibrePreset"]["enum"] == ["custom", "g652d"]
    assert schemas["G652DAttenuationApplication"]["enum"] == [
        "standard_cable",
        "short_jumper",
        "indoor_cable",
        "drop_cable",
    ]

    result = schemas["Level1SimulationResult"]
    assert {
        field: result["properties"][field]
        for field in (
            "configuration",
            "guidance",
            "mode_profile",
            "attenuation",
            "group_delay",
            "pulse_broadening",
            "standards_checks",
            "model_manifest",
        )
    } == {
        "configuration": {"$ref": "#/components/schemas/Level1SimulationRequest"},
        "guidance": {"$ref": "#/components/schemas/GuidanceResult"},
        "mode_profile": {"$ref": "#/components/schemas/GaussianModeProfileResult"},
        "attenuation": {"$ref": "#/components/schemas/ConstantAttenuationResult"},
        "group_delay": {"$ref": "#/components/schemas/GroupDelayResult"},
        "pulse_broadening": {"$ref": "#/components/schemas/ChromaticPulseBroadeningResult"},
        "standards_checks": {"$ref": "#/components/schemas/Level1StandardsChecks"},
        "model_manifest": {"$ref": "#/components/schemas/Level1SimulationManifest"},
    }
    assert result["properties"]["warnings"] == {
        "items": {"$ref": "#/components/schemas/Level1Warning"},
        "title": "Warnings",
        "type": "array",
    }

    standards = schemas["Level1StandardsChecks"]
    for field, reference in (
        ("preset_definition", "G652DPreset"),
        ("dispersion", "G652DDispersionCheckResult"),
        ("attenuation", "G652DAttenuationCheckResult"),
    ):
        assert standards["properties"][field]["anyOf"] == [
            {"$ref": f"#/components/schemas/{reference}"},
            {"type": "null"},
        ]

    warning = schemas["Level1Warning"]
    assert set(warning["properties"]) == {
        "code",
        "source_model_id",
        "message",
        "output_field",
    }
    assert warning["properties"]["code"] == {"$ref": "#/components/schemas/Level1WarningCode"}
    assert schemas["Level1WarningCode"]["enum"] == [
        "air_acceptance_angle_unavailable",
        "mode_count_unavailable",
        "g652d_attenuation_not_applicable",
    ]

    manifest = schemas["Level1SimulationManifest"]
    for field in ("component_model_ids", "assumptions", "limitations"):
        assert manifest["properties"][field]["type"] == "array"
        assert manifest["properties"][field]["items"] == {"type": "string"}

    profile = schemas["GaussianModeProfileResult"]
    assert profile["properties"]["x_um"] == {
        "items": {"type": "number"},
        "title": "X Um",
        "type": "array",
    }
    assert profile["properties"]["normalized_intensity"]["items"] == {
        "items": {"maximum": 1, "minimum": 0, "type": "number"},
        "type": "array",
    }


def test_guidance_result_components_have_exact_nested_contracts() -> None:
    schemas = main.app.openapi()["components"]["schemas"]

    result = schemas["GuidanceResult"]
    assert result["additionalProperties"] is False
    assert set(result["properties"]) == {
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
    assert set(result["required"]) == {
        "critical_angle_deg",
        "numerical_aperture_dimensionless",
        "relative_index_difference_dimensionless",
        "v_number_dimensionless",
        "mode_regime",
        "warnings",
        "model_manifest",
    }
    assert result["properties"]["air_acceptance_angle_deg"]["anyOf"] == [
        {"type": "number"},
        {"type": "null"},
    ]
    assert result["properties"]["approximate_mode_count"]["anyOf"] == [
        {"type": "number"},
        {"type": "null"},
    ]
    assert result["properties"]["warnings"]["items"] == {
        "$ref": "#/components/schemas/GuidanceWarning"
    }
    assert result["properties"]["model_manifest"] == {
        "$ref": "#/components/schemas/GuidanceModelManifest"
    }

    warning = schemas["GuidanceWarning"]
    assert warning["additionalProperties"] is False
    assert set(warning["properties"]) == {"code", "message", "output_field"}
    assert set(warning["required"]) == {"code", "message", "output_field"}
    assert warning["properties"]["code"] == {"$ref": "#/components/schemas/GuidanceWarningCode"}
    assert warning["properties"]["output_field"]["enum"] == [
        "air_acceptance_angle_deg",
        "approximate_mode_count",
    ]

    manifest = schemas["GuidanceModelManifest"]
    assert manifest["additionalProperties"] is False
    assert set(manifest["properties"]) == {
        "model_id",
        "model_version",
        "mode_regime_cutoff_v_dimensionless",
        "mode_count_min_v_dimensionless",
        "assumptions",
        "limitations",
    }
    assert set(manifest.get("required", ())) == set()
    assert manifest["properties"]["model_id"]["const"] == "ideal_circular_step_index_guidance"
    assert manifest["properties"]["model_version"]["const"] == "1.0.0"
    for field in ("assumptions", "limitations"):
        assert manifest["properties"][field] == {
            "items": {"type": "string"},
            "title": field.replace("_", " ").title(),
            "type": "array",
            "default": manifest["properties"][field]["default"],
        }

    assert schemas["GuidanceWarningCode"]["enum"] == [
        "air_acceptance_angle_unavailable",
        "mode_count_unavailable",
    ]
    assert schemas["ModeRegime"]["enum"] == ["single_mode", "multimode"]
