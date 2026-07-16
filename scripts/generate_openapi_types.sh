#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

uv run --frozen python -m scripts.export_openapi
mkdir -p packages/shared_schemas/generated
npm ci --prefix packages/shared_schemas
npm --prefix packages/shared_schemas run generate
