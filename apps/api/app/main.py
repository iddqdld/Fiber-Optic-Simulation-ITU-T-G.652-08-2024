from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from pydantic.json_schema import JsonSchemaMode, models_json_schema
from starlette.exceptions import HTTPException as StarletteHTTPException

from fibre_sim.guidance import GuidanceRequest

from .schemas import (
    ApplicationError,
    CableSection,
    Connector,
    DistanceSeries,
    ErrorBody,
    ErrorResponse,
    FibreDefinition,
    FieldCrossSection,
    HealthResponse,
    ModelManifest,
    ModelReference,
    ModelWarning,
    PulseSeries,
    SectionResult,
    SimulationConfig,
    SimulationResult,
    SimulationSummary,
    SolverOptions,
    SourceDefinition,
    Splice,
    StandardsCheckItem,
    StandardsCheckMetadata,
    ValidInputRange,
    WavelengthSeries,
)


class ContractFastAPI(FastAPI):
    def openapi(self) -> dict[str, Any]:
        if self.openapi_schema is None:
            self.openapi_schema = build_openapi_schema(self)
        return self.openapi_schema


app = ContractFastAPI(
    title="Optical Fibre Simulator API",
    version="0.0.0",
    openapi_url="/api/v1/openapi.json",
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
)


@app.get("/api/v1/health", response_model=HealthResponse)
def get_health() -> dict[str, str]:
    return {"status": "ok"}


CONTRACT_MODELS: tuple[type[BaseModel], ...] = (
    CableSection,
    Connector,
    DistanceSeries,
    ErrorBody,
    ErrorResponse,
    FieldCrossSection,
    FibreDefinition,
    GuidanceRequest,
    HealthResponse,
    ModelManifest,
    ModelReference,
    ModelWarning,
    PulseSeries,
    SectionResult,
    SimulationConfig,
    SimulationResult,
    SimulationSummary,
    SolverOptions,
    SourceDefinition,
    Splice,
    StandardsCheckItem,
    StandardsCheckMetadata,
    ValidInputRange,
    WavelengthSeries,
)


def _trace_id(request: Request) -> str:
    return request.headers.get("X-Trace-ID") or str(uuid4())


def _error_response(
    request: Request,
    status_code: int,
    code: str,
    message: str,
    field: str | None,
    details: dict[str, object],
    trace_id: str | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    response_trace_id = trace_id or _trace_id(request)
    response_headers = {} if headers is None else headers.copy()
    response_headers["X-Trace-ID"] = response_trace_id
    body = ErrorResponse(
        error=ErrorBody(
            code=code,
            message=message,
            field=field,
            details=details,
            trace_id=response_trace_id,
        )
    )
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(mode="json"),
        headers=response_headers,
    )


async def handle_application_error(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, ApplicationError):
        raise TypeError("unexpected exception type")
    return _error_response(
        request=request,
        status_code=exc.status_code,
        code=exc.code,
        message=exc.message,
        field=exc.field,
        details=exc.details,
        trace_id=exc.trace_id,
    )


async def handle_request_validation_error(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):
        raise TypeError("unexpected exception type")
    return _error_response(
        request=request,
        status_code=422,
        code="REQUEST_VALIDATION_ERROR",
        message="Request validation failed",
        field=None,
        details={"errors": jsonable_encoder(exc.errors())},
    )


async def handle_http_error(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, StarletteHTTPException):
        raise TypeError("unexpected exception type")
    return _error_response(
        request=request,
        status_code=exc.status_code,
        code="HTTP_ERROR",
        message=str(exc.detail),
        field=None,
        details={"detail": jsonable_encoder(exc.detail)},
        headers=dict(exc.headers or {}),
    )


app.add_exception_handler(ApplicationError, handle_application_error)
app.add_exception_handler(RequestValidationError, handle_request_validation_error)
app.add_exception_handler(StarletteHTTPException, handle_http_error)


def _contract_schemas() -> dict[str, Any]:
    model_inputs: list[tuple[type[BaseModel], JsonSchemaMode]] = [
        (model, "validation") for model in CONTRACT_MODELS
    ]
    model_schemas, definitions_wrapper = models_json_schema(
        model_inputs,
        ref_template="#/components/schemas/{model}",
    )
    schemas = {model.__name__: model_schemas[(model, "validation")] for model in CONTRACT_MODELS}
    schemas.update(definitions_wrapper.get("$defs", {}))
    schemas["LinkComponent"] = {
        "oneOf": [
            {"$ref": "#/components/schemas/Splice"},
            {"$ref": "#/components/schemas/Connector"},
        ],
        "discriminator": {
            "propertyName": "component_type",
            "mapping": {
                "splice": "#/components/schemas/Splice",
                "connector": "#/components/schemas/Connector",
            },
        },
    }
    return dict(sorted(schemas.items()))


def build_openapi_schema(application: FastAPI) -> dict[str, Any]:
    schema = get_openapi(
        title=application.title,
        version=application.version,
        routes=application.routes,
    )
    components = schema.setdefault("components", {})
    generated_schemas = components.setdefault("schemas", {})
    generated_schemas.update(_contract_schemas())
    return schema
