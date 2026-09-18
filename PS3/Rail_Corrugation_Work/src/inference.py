"""App-facing inference for the frozen rail corrugation model."""

from __future__ import annotations

import io
import sys
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
WORK_DIR = HERE.parent
MODEL_PATH = WORK_DIR / "models" / "rail_corrugation_model.joblib"

# The existing joblib artifact references the top-level model_def module.
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from features import extract_features, get_channel_groupings  # noqa: E402
from model_def import EnsembleRailModel  # noqa: E402,F401


@lru_cache(maxsize=1)
def _load_payload():
    payload = joblib.load(MODEL_PATH)
    if not {"model", "feature_cols"}.issubset(payload):
        raise ValueError("Model artifact is missing its model or feature schema")
    return payload


def predict_dataframe(frame: pd.DataFrame, file_id: str = "uploaded.csv") -> dict:
    """Predict one official-format recording; suitable for the shared app adapter."""
    if frame.shape != (10000, 129):
        raise ValueError(f"Expected 10000 rows and 129 columns; received {frame.shape}")
    if not all(pd.api.types.is_numeric_dtype(dtype) for dtype in frame.dtypes):
        raise ValueError("All 129 input columns must be numeric")
    if not np.isfinite(frame.to_numpy()).all():
        raise ValueError("Input contains a missing or non-finite value")
    groups = get_channel_groupings(frame.columns.tolist())
    if any(len(groups[key]) != 32 for key in ("side1_vib", "side2_vib", "side1_shock", "side2_shock")):
        raise ValueError("Sensor headers do not match the official rail channel layout")

    payload = _load_payload()
    features = extract_features(frame)
    schema = payload["feature_cols"]
    values = np.array([[features[name] for name in schema]], dtype=float)
    prediction = payload["model"].predict(
        values, is_stationary=[features["is_stationary"]]
    )[0]
    return {
        "subsystem": "Rail Corrugation",
        "file_id": file_id,
        "prediction": str(prediction),
        "speed_kmh": float(features["speed_kmh"]),
        "speed_transitions": int(features["transitions"]),
        "low_transition_override": bool(features["is_stationary"]),
    }


def predict_csv_bytes(data: bytes, file_id: str = "uploaded.csv") -> dict:
    """Predict bytes from an uploaded CSV file."""
    return predict_dataframe(pd.read_csv(io.BytesIO(data)), file_id=file_id)


def predict_file(path: str | Path) -> dict:
    """Predict a CSV on disk."""
    path = Path(path)
    return predict_dataframe(pd.read_csv(path), file_id=path.name)
