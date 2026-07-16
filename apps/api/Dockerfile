FROM ghcr.io/astral-sh/uv:0.11.8 AS uv

FROM python:3.12.13-slim-bookworm AS base

COPY --from=uv /uv /uvx /usr/local/bin/

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_NO_CACHE=1 \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

RUN groupadd --system app && useradd --system --gid app --home-dir /app --no-create-home app

COPY pyproject.toml uv.lock .python-version ./
COPY packages/physics_core/pyproject.toml packages/physics_core/pyproject.toml
COPY packages/physics_core/src packages/physics_core/src

ENV PATH="/app/.venv/bin:$PATH"

FROM base AS test

RUN uv sync --frozen --no-editable

COPY apps/api/app apps/api/app
COPY apps/api/tests apps/api/tests
COPY packages/physics_core/tests packages/physics_core/tests

USER app

CMD ["uv", "run", "--frozen", "--no-sync", "pytest"]

FROM base AS runtime

RUN uv sync --frozen --no-dev --no-editable

COPY apps/api/app apps/api/app

USER app

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health')"]

CMD ["uvicorn", "apps.api.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
