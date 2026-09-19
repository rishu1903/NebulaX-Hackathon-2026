from __future__ import annotations

import csv
import sys
from io import BytesIO, StringIO
from pathlib import Path
from typing import Any

import pandas as pd


SUBSYSTEM = "Door"
DOOR_SRC = Path(__file__).resolve().parents[2] / "Door_Work" / "src"
if str(DOOR_SRC) not in sys.path:
    sys.path.insert(0, str(DOOR_SRC))

import predict_door  # noqa: E402

REQUIRED_COLUMNS = set(predict_door.REQUIRED)
IMPLEMENTATION = "PS3/Door_Work/src/predict_door.py"


def _empty_response(filename: str, error: str) -> dict[str, Any]:
    return {
        "subsystem": SUBSYSTEM,
        "success": False,
        "filename": filename,
        "headline": "Door upload could not be analysed",
        "prediction": None,
        "summary": {},
        "table": [],
        "chart_data": None,
        "technical_details": {"implementation": IMPLEMENTATION},
        "submission_csv": None,
        "error": error,
    }


def _submission_csv(predictions: pd.DataFrame) -> str:
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=["start_time", "end_time", "prediction"], lineterminator="\n")
    writer.writeheader()
    for row in predictions[["start_time", "end_time", "prediction"]].to_dict("records"):
        writer.writerow(row)
    return output.getvalue()


def analyse_upload(file_bytes: bytes, filename: str) -> dict[str, Any]:
    safe_name = Path(filename).name or "uploaded_door.csv"
    if not safe_name.lower().endswith(".csv"):
        return _empty_response(safe_name, "Door uploads must be .csv files.")
    if not isinstance(file_bytes, (bytes, bytearray)):
        return _empty_response(safe_name, "Uploaded file content must be bytes.")

    try:
        frame = pd.read_csv(BytesIO(bytes(file_bytes)))
        missing = sorted(REQUIRED_COLUMNS - set(frame.columns))
        if missing:
            return _empty_response(
                safe_name,
                f"Door CSV is missing required column(s): {', '.join(missing)}.",
            )
        predictions = predict_door.classify(frame)
    except Exception as exc:
        return _empty_response(safe_name, f"Door inference failed: {exc}")

    labels = predictions["prediction"]
    abnormal = int((labels == predict_door.LABEL_ABNORMAL).sum())
    normal = int((labels == predict_door.LABEL_NORMAL).sum())
    total = int(len(predictions))
    needs_review = int((predictions["quality_flags"] != "").sum())

    return {
        "subsystem": SUBSYSTEM,
        "success": True,
        "filename": safe_name,
        "headline": f"{abnormal} of {total} door cycles show abnormal resistance",
        "prediction": labels.tolist(),
        "summary": {
            "cycles_found": total,
            "normal": normal,
            "abnormal": abnormal,
            "abnormal_rate": abnormal / total if total else 0.0,
            "needs_review": needs_review,
        },
        "table": predictions.to_dict("records"),
        "chart_data": {
            "labels": [predict_door.LABEL_NORMAL, predict_door.LABEL_ABNORMAL],
            "values": [normal, abnormal],
        },
        "technical_details": {
            "implementation": IMPLEMENTATION,
            "model": "per-operation decision stump on trimmed-mean motor current / back-EMF (mechanical resistance)",
            "thresholds": dict(predict_door.THRESHOLDS),
            "version": predict_door.__version__,
            "retraining_during_inference": False,
            "input_format": "Door telemetry CSV with official headers",
            "submission_schema": ["start_time", "end_time", "prediction"],
        },
        "submission_csv": _submission_csv(predictions),
        "error": None,
    }
