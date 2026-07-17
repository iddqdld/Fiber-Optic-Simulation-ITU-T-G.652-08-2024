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

    assert set(paths) == {"/api/v1/health", "/api/v1/guidance/calculate"}
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
