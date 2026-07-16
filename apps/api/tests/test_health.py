from apps.api.app.main import app, get_health


def test_health_endpoint_contract() -> None:
    assert get_health() == {"status": "ok"}

    paths = app.openapi()["paths"]
    assert "/api/v1/health" in paths
    assert "200" in paths["/api/v1/health"]["get"]["responses"]
