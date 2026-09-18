from __future__ import annotations

import csv
import sys
from io import StringIO
from pathlib import Path
from typing import Any


SUBSYSTEM = "Rail Corrugation"
RAIL_SRC = Path(__file__).resolve().parents[2] / "Rail_Corrugation_Work" / "src"
if str(RAIL_SRC) not in sys.path:
    sys.path.insert(0, str(RAIL_SRC))

from inference import predict_csv_bytes  # noqa: E402


def _empty_response(filename: str, error: str) -> dict[str, Any]:
    return {
        "subsystem": SUBSYSTEM,
        "success": False,
        "filename": filename,
        "headline": "Rail corrugation upload could not be analysed",
        "prediction": None,
        "summary": {},
        "table": [],
        "chart_data": None,
        "technical_details": {"implementation": "PS3/Rail_Corrugation_Work/src/inference.py"},
        "submission_csv": None,
        "error": error,
    }


def _submission_csv(file_id: str, prediction: str) -> str:
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=["file_id", "prediction"], lineterminator="\n")
    writer.writeheader()
    writer.writerow({"file_id": file_id, "prediction": prediction})
    return output.getvalue()


def analyse_upload(file_bytes: bytes, filename: str) -> dict[str, Any]:
    safe_name = Path(filename).name or "uploaded_rail.csv"
    if not safe_name.lower().endswith(".csv"):
        return _empty_response(safe_name, "Rail corrugation uploads must be .csv files.")
    if not isinstance(file_bytes, (bytes, bytearray)):
        return _empty_response(safe_name, "Uploaded file content must be bytes.")

    try:
        result = predict_csv_bytes(bytes(file_bytes), file_id=safe_name)
    except Exception as exc:
        return _empty_response(safe_name, f"Rail corrugation inference failed: {exc}")

    prediction = str(result["prediction"])
    return {
        "subsystem": SUBSYSTEM,
        "success": True,
        "filename": safe_name,
        "headline": f"Predicted rail condition: {prediction}",
        "prediction": prediction,
        "summary": {
            "speed_kmh": result["speed_kmh"],
            "speed_transitions": result["speed_transitions"],
            "low_transition_override": result["low_transition_override"],
        },
        "table": [{"file_id": safe_name, "prediction": prediction}],
        "chart_data": None,
        "technical_details": {
            "implementation": "PS3/Rail_Corrugation_Work/src/inference.predict_csv_bytes",
            "model": "frozen joblib ensemble artifact",
            "model_artifact": "PS3/Rail_Corrugation_Work/models/rail_corrugation_model.joblib",
            "retraining_during_inference": False,
            "input_format": "Rail CSV with 10000 rows and 129 numeric columns",
            "submission_schema": ["file_id", "prediction"],
        },
        "submission_csv": _submission_csv(safe_name, prediction),
        "error": None,
    }

