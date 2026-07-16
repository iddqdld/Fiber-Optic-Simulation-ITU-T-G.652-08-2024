import json
from pathlib import Path

from apps.api.app.main import app

ROOT = Path(__file__).resolve().parents[1]
output_path = ROOT / "packages/shared_schemas/schema/openapi.json"
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(
    json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
)
