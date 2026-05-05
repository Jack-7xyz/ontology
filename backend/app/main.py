"""Ontology FastAPI entry."""

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# Load ontology/.env before any routers import (Ask Ontology needs ANTHROPIC_API_KEY).
# Never raises if missing — env loading is best-effort.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from .routers import ask_ontology, bi, improvements, mechanics, plus, source, triggers  # noqa: E402

app = FastAPI(title="Ontology Retail Backend", version="0.0.1")
app.include_router(source.router)
app.include_router(plus.router)
app.include_router(bi.router)
app.include_router(mechanics.router)
app.include_router(improvements.router)
app.include_router(ask_ontology.router)
app.include_router(triggers.router)

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "dist"
FRONTEND_ASSETS = FRONTEND_DIST / "assets"

if FRONTEND_ASSETS.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_ASSETS), name="assets")


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/{full_path:path}")
def spa_shell(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not Found")
    index_file = FRONTEND_DIST / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=503, detail="Frontend build not found")
    return FileResponse(index_file)
