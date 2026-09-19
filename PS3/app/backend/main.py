"""HTTP API for the PS3 Train Condition Monitoring app.

Run from the repository root so the subsystem adapters can import their code:

    uvicorn PS3.app.backend.main:app --port 8000

Every route lives under /api so a reverse proxy (e.g. Firebase Hosting rewriting
/api/** to Cloud Run) can forward it unchanged. The service is stateless: uploads are
processed in memory / a temp dir and never kept.
"""
from __future__ import annotations

import importlib
import logging
import os
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

from fastapi import APIRouter, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logger = logging.getLogger("ps3.api")

# Cloud Run rejects request bodies over 32 MiB, so stay just under it.
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "30"))
CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if o.strip()
]
READ_CHUNK = 1024 * 1024


@dataclass(frozen=True)
class Subsystem:
    key: str
    label: str
    module: str
    extensions: tuple[str, ...]


SUBSYSTEMS: dict[str, Subsystem] = {
    s.key: s
    for s in (
        Subsystem("acv", "ACV", "PS3.app.adapters.acv_adapter", (".xlsx",)),
        Subsystem("door", "Door", "PS3.app.adapters.door_adapter", (".csv",)),
        Subsystem("rail", "Rail Corrugation", "PS3.app.adapters.rail_adapter", (".csv",)),
        Subsystem("shm", "SHM", "PS3.app.adapters.shm_adapter", (".csv",)),
    )
}

# key -> imported adapter module, or the error string if it failed to import.
_adapters: dict[str, Any] = {}
_adapter_errors: dict[str, str] = {}


def _load_adapters() -> None:
    """Import each adapter independently so one broken subsystem cannot take the API down."""
    for key, sub in SUBSYSTEMS.items():
        try:
            _adapters[key] = importlib.import_module(sub.module)
            _adapter_errors.pop(key, None)
        except Exception as exc:  # noqa: BLE001 - surfaced to the caller as a 503
            _adapters.pop(key, None)
            _adapter_errors[key] = f"{type(exc).__name__}: {exc}"
            logger.exception("Could not load %s adapter", sub.label)


@asynccontextmanager
async def lifespan(_: FastAPI):
    _load_adapters()
    yield


app = FastAPI(title="PS3 Train Condition Monitoring API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
router = APIRouter(prefix="/api")


def _subsystem_status(key: str) -> dict[str, Any]:
    sub = SUBSYSTEMS[key]
    return {
        "key": key,
        "label": sub.label,
        "accepts": list(sub.extensions),
        "available": key in _adapters,
        "error": _adapter_errors.get(key),
    }


@router.get("/health")
def health() -> dict[str, Any]:
    """Liveness probe; also reports which subsystems loaded."""
    return {"status": "ok", "subsystems": {k: k in _adapters for k in SUBSYSTEMS}}


@router.get("/subsystems")
def list_subsystems() -> dict[str, Any]:
    return {"max_upload_mb": MAX_UPLOAD_MB, "subsystems": [_subsystem_status(k) for k in SUBSYSTEMS]}


def _read_limited(upload: UploadFile) -> bytes:
    """Read the upload, refusing anything larger than MAX_UPLOAD_MB without buffering it all."""
    limit = MAX_UPLOAD_MB * 1024 * 1024
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = upload.file.read(READ_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise HTTPException(status_code=413, detail=f"File is larger than the {MAX_UPLOAD_MB} MB limit.")
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/analyse/{subsystem}")
def analyse(subsystem: str, file: UploadFile = File(...)) -> JSONResponse:
    """Run an uploaded file through one subsystem's model.

    Returns the adapter's result contract. A file the model cannot analyse still returns
    the contract (success=false, error=...) but with HTTP 422.
    """
    key = subsystem.lower()
    sub = SUBSYSTEMS.get(key)
    if sub is None:
        raise HTTPException(status_code=404, detail=f"Unknown subsystem '{subsystem}'. Use one of: {', '.join(SUBSYSTEMS)}.")
    if key not in _adapters:
        raise HTTPException(status_code=503, detail=f"{sub.label} is unavailable: {_adapter_errors.get(key, 'not loaded')}")

    filename = os.path.basename(file.filename or "")
    if not filename.lower().endswith(sub.extensions):
        raise HTTPException(status_code=415, detail=f"{sub.label} uploads must be {' or '.join(sub.extensions)} files.")

    data = _read_limited(file)
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    result = _adapters[key].analyse_upload(data, filename)
    return JSONResponse(result, status_code=200 if result.get("success") else 422)


app.include_router(router)
