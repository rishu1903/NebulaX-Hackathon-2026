from __future__ import annotations

import csv
import sys
import tempfile
from io import StringIO
from pathlib import Path
from typing import Any

import pandas as pd


SUBSYSTEM = "ACV"
ACV_SRC = Path(__file__).resolve().parents[2] / "dev" / "ACV"
if str(ACV_SRC) not in sys.path:
    sys.path.insert(0, str(ACV_SRC))

from acv_core import predict_file, severity  # noqa: E402


def _empty_response(filename: str, error: str) -> dict[str, Any]:
    return {
        "subsystem": SUBSYSTEM,
        "success": False,
        "filename": filename,
        "headline": "ACV upload could not be analysed",
        "prediction": None,
        "summary": {},
        "table": [],
        "chart_data": None,
        "technical_details": {"implementation": "PS3/dev/ACV/acv_core.py"},
        "submission_csv": None,
        "error": error,
    }


def _submission_csv(file_id: str, ranked_cars_str: str) -> str:
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=["file_id", "ranked_cars"], lineterminator="\n")
    writer.writeheader()
    writer.writerow({"file_id": file_id, "ranked_cars": ranked_cars_str})
    return output.getvalue()


def analyse_upload(file_bytes: bytes, filename: str) -> dict[str, Any]:
    safe_name = Path(filename).name or "uploaded_acv.xlsx"
    if not safe_name.lower().endswith(".xlsx"):
        return _empty_response(safe_name, "ACV uploads must be .xlsx files.")
    if not isinstance(file_bytes, (bytes, bytearray)):
        return _empty_response(safe_name, "Uploaded file content must be bytes.")

    try:
        with tempfile.TemporaryDirectory(prefix="acv_upload_") as temp_dir:
            temp_path = Path(temp_dir) / safe_name
            temp_path.write_bytes(bytes(file_bytes))
            result = predict_file(temp_path)
    except Exception as exc:
        return _empty_response(safe_name, f"ACV inference failed: {exc}")

    rows = []
    for rank, car in enumerate(result["ranked_cars"], start=1):
        score = result["scores"].get(car)
        rows.append(
            {
                "rank": rank,
                "car": car,
                "score": None if pd.isna(score) else float(score),
                "risk": severity(score),
            }
        )

    top_car = result["ranked_cars"][0] if result["ranked_cars"] else None
    return {
        "subsystem": SUBSYSTEM,
        "success": True,
        "filename": safe_name,
        "headline": f"Inspect car {top_car} first" if top_car else "No cars could be ranked",
        "prediction": result["ranked_cars_str"],
        "summary": {
            "top_car": top_car,
            "cars_ranked": len(result["ranked_cars"]),
            "schema_matched": result["schema_matched"],
            "empty_cars": result["empty_cars"],
            "margin": result["margin"],
        },
        "table": rows,
        "chart_data": {"cars": [row["car"] for row in rows], "scores": [row["score"] for row in rows]},
        "technical_details": {
            "implementation": "PS3/dev/ACV/acv_core.predict_file",
            "model": "within-file refrigerant-leak ranking heuristic; no trained artifact",
            "retraining_during_inference": False,
            "input_format": "Excel .xlsx ACV case file",
            "submission_schema": ["file_id", "ranked_cars"],
        },
        "submission_csv": _submission_csv(safe_name, result["ranked_cars_str"]),
        "error": None,
    }

