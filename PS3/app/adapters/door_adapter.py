from __future__ import annotations

import csv
import tempfile
from functools import lru_cache
from io import StringIO
from pathlib import Path
from typing import Any

import pandas as pd

from src.subsystems.door.pipeline import DoorPipeline


SUBSYSTEM = "Door"
REQUIRED_COLUMNS = {
    "Datetime",
    "Motor current(mA)",
    "Motor Voltage(10mV)",
    "Motor electrodynamic force",
    "Door leaf position",
    "Door is opening",
}


@lru_cache(maxsize=1)
def _pipeline() -> DoorPipeline:
    return DoorPipeline().train()


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
        "technical_details": {
            "implementation": "src.subsystems.door.pipeline.DoorPipeline",
            "note": (
                "PS3/Door_Work is malformed in the current branch, so the adapter uses "
                "the safest executable Door implementation in src/subsystems/door."
            ),
        },
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
        with tempfile.TemporaryDirectory(prefix="door_upload_") as temp_dir:
            temp_path = Path(temp_dir) / safe_name
            temp_path.write_bytes(bytes(file_bytes))
            preview = pd.read_csv(temp_path, nrows=1)
            missing = sorted(REQUIRED_COLUMNS - set(preview.columns))
            if missing:
                return _empty_response(
                    safe_name,
                    f"Door CSV is missing required column(s): {', '.join(missing)}.",
                )
            predictions = _pipeline().predict_stream(temp_path)
    except Exception as exc:
        return _empty_response(safe_name, f"Door inference failed: {exc}")

    abnormal = int((predictions["prediction"] == "Abnormal resistance").sum())
    normal = int((predictions["prediction"] == "Normal").sum())
    total = int(len(predictions))
    headline = f"{abnormal} of {total} door cycles show abnormal resistance"

    return {
        "subsystem": SUBSYSTEM,
        "success": True,
        "filename": safe_name,
        "headline": headline,
        "prediction": predictions["prediction"].tolist(),
        "summary": {
            "cycles_found": total,
            "normal": normal,
            "abnormal": abnormal,
            "abnormal_rate": abnormal / total if total else 0.0,
        },
        "table": predictions.to_dict("records"),
        "chart_data": {
            "labels": ["Normal", "Abnormal resistance"],
            "values": [normal, abnormal],
        },
        "technical_details": {
            "implementation": "src.subsystems.door.pipeline.DoorPipeline",
            "model": "RandomForestClassifier baseline trained from official Door training CSV on first use",
            "retraining_during_inference": True,
            "input_format": "Door telemetry CSV with official headers",
            "submission_schema": ["start_time", "end_time", "prediction"],
        },
        "submission_csv": _submission_csv(predictions),
        "error": None,
    }

