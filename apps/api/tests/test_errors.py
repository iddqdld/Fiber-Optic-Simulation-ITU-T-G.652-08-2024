import asyncio
import json
from typing import Any, cast

from apps.api.app import main
from apps.api.app.main import (
    handle_application_error,
    handle_http_error,
    handle_request_validation_error,
)
from apps.api.app.schemas import ApplicationError
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse


def request(trace_id: str | None = None) -> Request:
    headers = [] if trace_id is None else [(b"x-trace-id", trace_id.encode())]
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/simulations",
            "headers": headers,
        }
    )


def body(response: JSONResponse) -> dict[str, Any]:
    return cast(dict[str, Any], json.loads(bytes(response.body).decode()))


def test_application_error_handler_returns_standard_envelope_and_trace_header() -> None:
    response = asyncio.run(
        handle_application_error(
            request("trace-application"),
            ApplicationError(
                code="INVALID_CONFIG",
                message="Invalid simulation configuration",
                field="source",
                details={"reason": "missing"},
                status_code=400,
            ),
        )
    )

    assert response.status_code == 400
    assert response.headers["x-trace-id"] == "trace-application"
    assert body(response) == {
        "error": {
            "code": "INVALID_CONFIG",
            "message": "Invalid simulation configuration",
            "field": "source",
            "details": {"reason": "missing"},
            "trace_id": "trace-application",
        }
    }


def test_request_validation_handler_returns_stable_uppercase_code() -> None:
    exc = RequestValidationError(
        [
            {
                "type": "missing",
                "loc": ("body", "source"),
                "msg": "Field required",
                "input": {},
            }
        ]
    )

    response = asyncio.run(handle_request_validation_error(request("trace-validation"), exc))

    assert response.status_code == 422
    assert response.headers["x-trace-id"] == "trace-validation"
    assert body(response)["error"]["code"] == "REQUEST_VALIDATION_ERROR"


def test_starlette_http_error_handler_returns_stable_envelope() -> None:
    response = asyncio.run(handle_http_error(request(), HTTPException(404, "Not found")))

    assert response.status_code == 404
    assert response.headers["x-trace-id"]
    assert body(response)["error"]["code"] == "HTTP_ERROR"
    assert HTTPException in main.app.exception_handlers
