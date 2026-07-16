from pydantic import Field

from .base import ContractModel


class ErrorBody(ContractModel):
    code: str
    message: str
    field: str | None = None
    details: dict[str, object] = Field(default_factory=dict)
    trace_id: str


class ErrorResponse(ContractModel):
    error: ErrorBody


class ApplicationError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        field: str | None = None,
        details: dict[str, object] | None = None,
        status_code: int = 400,
        trace_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.field = field
        self.details = {} if details is None else details
        self.status_code = status_code
        self.trace_id = trace_id
