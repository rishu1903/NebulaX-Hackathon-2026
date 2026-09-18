"""UI-neutral adapter for SHM web-app integrations.

The adapter handles uploaded bytes and download formatting, while delegating
all model inference to shm_inference.predict_shm_file().
"""

from __future__ import annotations

import csv
import tempfile
from io import StringIO
from pathlib import Path
from typing import Any

from shm_inference import ShmInferenceError, predict_shm_file


class ShmAppAdapterError(ValueError):
    """User-facing error for SHM upload handling."""

    def __init__(self, message: str, original_error: Exception | None = None):
        super().__init__(message)
        self.original_error = original_error


def _safe_original_name(original_filename: str | Path) -> str:
    name = Path(str(original_filename)).name
    return name or "uploaded_signal.csv"


def _friendly_error_message(error: ShmInferenceError) -> str:
    raw_message = str(error)
    lowered = raw_message.lower()

    if "exactly one signal column" in lowered:
        return "The uploaded CSV must contain exactly one stress signal column."
    if "only numeric values" in lowered:
        return "The uploaded CSV contains non-numeric values. Please upload numeric stress data only."
    if "nan" in lowered:
        return "The uploaded CSV contains missing values. Please remove or replace them before uploading."
    if "infinity" in lowered:
        return "The uploaded CSV contains infinite values, which cannot be scored."
    if "constant" in lowered:
        return "The uploaded signal is constant, so fatigue damage cannot be estimated."
    if "too short" in lowered:
        return "The uploaded signal is too short for meaningful SHM inference."
    if "could not be read" in lowered:
        return "The uploaded file could not be read as a valid CSV."
    if "expects" in lowered and "rows" in lowered:
        return raw_message

    return raw_message


def predict_shm_upload(
    file_bytes: bytes | bytearray,
    original_filename: str | Path,
) -> dict[str, Any]:
    """Predict SHM damage from uploaded CSV bytes.

    The original filename is kept only as display/submission identity. It is
    never used as a predictive feature.
    """
    safe_name = _safe_original_name(original_filename)
    if not safe_name.lower().endswith(".csv"):
        raise ShmAppAdapterError("Unsupported file type. Please upload a .csv file.")
    if not isinstance(file_bytes, (bytes, bytearray)):
        raise ShmAppAdapterError("Uploaded file content must be bytes.")

    try:
        with tempfile.TemporaryDirectory(prefix="shm_upload_") as temp_dir:
            temp_path = Path(temp_dir) / safe_name
            temp_path.write_bytes(bytes(file_bytes))
            inference_result = predict_shm_file(temp_path)
    except ShmInferenceError as exc:
        raise ShmAppAdapterError(_friendly_error_message(exc), exc) from exc
    except OSError as exc:
        raise ShmAppAdapterError("The uploaded file could not be processed.", exc) from exc

    return {
        "subsystem": "SHM",
        "file_id": safe_name,
        "prediction": float(inference_result["prediction"]),
        "model_name": str(inference_result["model_name"]),
        "technical_details": {
            "fatigue_power_5": float(inference_result["fatigue_power_5"]),
        },
    }


def prediction_result_to_submission_csv(result: dict[str, Any]) -> str:
    """Convert one adapter result into official SHM submission CSV text."""
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=["file_id", "prediction"], lineterminator="\n")
    writer.writeheader()
    writer.writerow(
        {
            "file_id": result["file_id"],
            "prediction": result["prediction"],
        }
    )
    return output.getvalue()
