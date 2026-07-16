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
