COMPOSE ?= docker compose

.PHONY: dev quality-images contracts test lint format build down

dev:
	$(COMPOSE) --profile core up --build

quality-images:
	$(COMPOSE) --profile test build

contracts:
	./scripts/generate_openapi_types.sh

test: quality-images
	$(COMPOSE) --profile test run --rm api-test
	$(COMPOSE) --profile test run --rm web-test

lint: quality-images
	$(COMPOSE) --profile test run --rm api-test uv run --frozen --no-sync ruff check .
	$(COMPOSE) --profile test run --rm api-test uv run --frozen --no-sync ruff format --check .
	$(COMPOSE) --profile test run --rm api-test uv run --frozen --no-sync mypy
	$(COMPOSE) --profile test run --rm web-test npm run lint
	$(COMPOSE) --profile test run --rm web-test npm run format:check

format:
	uv run ruff check --fix .
	uv run ruff format .
	npm --prefix apps/web run format

build:
	$(COMPOSE) --profile core build

down:
	$(COMPOSE) --profile core --profile test down
