from __future__ import annotations

import sys
from pathlib import Path
from typing import Any


SUBSYSTEM = "SHM"
SHM_SRC = Path(__file__).resolve().parents[2] / "SHM_Work" / "src"
if str(SHM_SRC) not in sys.path:
    sys.path.insert(0, str(SHM_SRC))

from shm_app_adapter import (  # noqa: E402
    ShmAppAdapterError,
    prediction_result_to_submission_csv,
    predict_shm_upload,
)


def _empty_response(filename: str, error: str) -> dict[str, Any]:
    return {
        "subsystem": SUBSYSTEM,
        "success": False,
        "filename": filename,
        "headline": "SHM upload could not be analysed",
        "prediction": None,
        "summary": {},
        "table": [],
        "chart_data": None,
        "technical_details": {"implementation": "PS3/SHM_Work/src/shm_app_adapter.py"},
        "submission_csv": None,
        "error": error,
    }


def analyse_upload(file_bytes: bytes, filename: str) -> dict[str, Any]:
    safe_name = Path(filename).name or "uploaded_shm.csv"
    if not isinstance(file_bytes, (bytes, bytearray)):
        return _empty_response(safe_name, "Uploaded file content must be bytes.")

    try:
        result = predict_shm_upload(bytes(file_bytes), safe_name)
    except ShmAppAdapterError as exc:
        return _empty_response(safe_name, str(exc))
    except Exception as exc:
        return _empty_response(safe_name, f"SHM inference failed: {exc}")

    prediction = float(result["prediction"])
    return {
        "subsystem": SUBSYSTEM,
        "success": True,
        "filename": safe_name,
        "headline": f"Predicted cumulative damage: {prediction:.6g}",
        "prediction": prediction,
        "summary": {
            "predicted_damage": prediction,
            "model_name": result["model_name"],
        },
        "table": [{"file_id": safe_name, "prediction": prediction}],
        "chart_data": None,
        "technical_details": {
            "implementation": "PS3/SHM_Work/src/shm_app_adapter.predict_shm_upload",
            "model": result["model_name"],
            "retraining_during_inference": False,
            "input_format": "One-column SHM stress signal CSV with official segment length",
            "submission_schema": ["file_id", "prediction"],
            **result["technical_details"],
        },
        "submission_csv": prediction_result_to_submission_csv(result),
        "error": None,
    }
