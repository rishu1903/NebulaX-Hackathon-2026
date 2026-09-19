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


DISTANCE_PER_TRANSITION_M = (np.pi * 0.85) / (90 * 2)
LOCALIZATION_WINDOW_SAMPLES = 2000
LOCALIZATION_HOP_SAMPLES = 500


def _estimate_hotspot(frame: pd.DataFrame, side: str) -> dict[str, float]:
    """Estimate the strongest local-energy interval on a classified rail side.

    The frozen classifier produces one label for the complete recording. This
    diagnostic uses the same detrended sensor families as feature extraction,
    then maps its strongest sliding window to distance using the wheel pulses.
    """
    groups = get_channel_groupings(frame.columns.tolist())
    group_key = "side1_all" if side == "I" else "side2_all"
    sensor_positions = groups[group_key]
    sensors = frame.iloc[:, sensor_positions].to_numpy(dtype=float)
    sensors -= sensors.mean(axis=0, keepdims=True)

    # Give every sensor equal influence while retaining changes in local energy.
    channel_rms = np.sqrt(np.mean(sensors ** 2, axis=0))
    normalized = sensors / np.maximum(channel_rms, 1e-12)

    starts = range(
        0,
        len(frame) - LOCALIZATION_WINDOW_SAMPLES + 1,
        LOCALIZATION_HOP_SAMPLES,
    )
    window_scores = np.asarray([
        np.mean(normalized[start:start + LOCALIZATION_WINDOW_SAMPLES] ** 2)
        for start in starts
    ])
    peak_index = int(np.argmax(window_scores))
    start_sample = peak_index * LOCALIZATION_HOP_SAMPLES
    end_sample = start_sample + LOCALIZATION_WINDOW_SAMPLES - 1

    speed = frame.iloc[:, 0].to_numpy()
    transition_at_sample = np.r_[0, np.cumsum(np.diff(speed) != 0)]
    start_m = float(transition_at_sample[start_sample] * DISTANCE_PER_TRANSITION_M)
    end_m = float(transition_at_sample[end_sample] * DISTANCE_PER_TRANSITION_M)
    total_m = float(transition_at_sample[-1] * DISTANCE_PER_TRANSITION_M)
    median_score = float(np.median(window_scores))

    return {
        "start_m": start_m,
        "end_m": end_m,
        "center_m": (start_m + end_m) / 2,
        "total_m": total_m,
        "peak_to_median_energy": float(window_scores[peak_index] / max(median_score, 1e-12)),
    }


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
    prediction = str(prediction)
    hotspot = (
        _estimate_hotspot(frame, prediction.removeprefix("Side "))
        if prediction in {"Side I", "Side II"} and not features["is_stationary"]
        else None
    )
    return {
        "subsystem": "Rail Corrugation",
        "file_id": file_id,
        "prediction": prediction,
        "speed_kmh": float(features["speed_kmh"]),
        "speed_transitions": int(features["transitions"]),
        "low_transition_override": bool(features["is_stationary"]),
        "hotspot": hotspot,
    }


def predict_csv_bytes(data: bytes, file_id: str = "uploaded.csv") -> dict:
    """Predict bytes from an uploaded CSV file."""
    return predict_dataframe(pd.read_csv(io.BytesIO(data)), file_id=file_id)


def predict_file(path: str | Path) -> dict:
    """Predict a CSV on disk."""
    path = Path(path)
    return predict_dataframe(pd.read_csv(path), file_id=path.name)
