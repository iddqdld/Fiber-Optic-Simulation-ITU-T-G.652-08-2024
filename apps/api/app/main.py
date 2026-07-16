from fastapi import FastAPI

app = FastAPI(title="Optical Fibre Simulator API", version="0.0.0")


@app.get("/api/v1/health")
def get_health() -> dict[str, str]:
    return {"status": "ok"}
