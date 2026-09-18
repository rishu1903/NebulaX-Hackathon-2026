"""App-facing SHM single-file inference.

This module is intended for use by the final web application. It validates a
single uploaded SHM CSV, reuses the training feature-engineering path, and
returns a small prediction payload without retraining.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from extract_shm_features import EXPECTED_SIGNAL_LENGTH, extract_features_for_file


WORK_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_METADATA_PATH = WORK_ROOT / "outputs" / "submission" / "shm_final_model_metadata.json"
SELECTED_FEATURE = "fatigue_power_5"
MIN_MEANINGFUL_OBSERVATIONS = 1_000


class ShmInferenceError(ValueError):
    """User-friendly validation or inference error for uploaded SHM files."""


def load_model_metadata(metadata_path: Path = DEFAULT_METADATA_PATH) -> dict[str, Any]:
    """Load final model metadata written by the submission pipeline."""
    if not metadata_path.exists():
        raise ShmInferenceError(
            f"SHM model metadata was not found at {metadata_path}. "
            "Run predict_shm.py first or provide the packaged metadata file."
        )

    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ShmInferenceError(f"SHM model metadata is not valid JSON: {metadata_path}") from exc

    required_fields = {"model_name", "fitted_k", "selected_feature"}
    missing_fields = required_fields - set(metadata)
    if missing_fields:
        raise ShmInferenceError(
            f"SHM model metadata is missing required fields: {sorted(missing_fields)}"
        )
    if metadata["selected_feature"] != SELECTED_FEATURE:
        raise ShmInferenceError(
            f"Unsupported SHM model feature {metadata['selected_feature']!r}; "
            f"expected {SELECTED_FEATURE!r}."
        )

    try:
        fitted_k = float(metadata["fitted_k"])
    except (TypeError, ValueError) as exc:
        raise ShmInferenceError("SHM model metadata field 'fitted_k' must be numeric.") from exc
    if not np.isfinite(fitted_k) or fitted_k <= 0:
        raise ShmInferenceError("SHM model metadata field 'fitted_k' must be positive and finite.")

    metadata["fitted_k"] = fitted_k
    return metadata


def validate_uploaded_signal_file(file_path: str | Path) -> Path:
    """Validate an uploaded CSV before feature extraction and prediction."""
    path = Path(file_path).expanduser()
    if not path.exists():
        raise ShmInferenceError(f"Uploaded SHM file does not exist: {path}")
    if not path.is_file():
        raise ShmInferenceError(f"Uploaded SHM path is not a file: {path}")
    if path.suffix.lower() != ".csv":
        raise ShmInferenceError("Uploaded SHM file must be a .csv file.")

    try:
        raw_df = pd.read_csv(path, header=None, dtype=str, keep_default_na=False)
    except Exception as exc:
        raise ShmInferenceError(f"Uploaded SHM CSV could not be read: {exc}") from exc

    if raw_df.shape[1] != 1:
        raise ShmInferenceError(
            f"Uploaded SHM CSV must contain exactly one signal column; "
            f"found {raw_df.shape[1]} columns."
        )
    if len(raw_df) < MIN_MEANINGFUL_OBSERVATIONS:
        raise ShmInferenceError(
            f"Uploaded SHM signal is too short for meaningful inference: "
            f"{len(raw_df)} rows found, at least {MIN_MEANINGFUL_OBSERVATIONS} required."
        )

    try:
        signal = pd.to_numeric(raw_df.iloc[:, 0], errors="raise").to_numpy(dtype=float)
    except Exception as exc:
        raise ShmInferenceError(
            "Uploaded SHM signal must contain only numeric values."
        ) from exc

    if np.isnan(signal).any():
        raise ShmInferenceError("Uploaded SHM signal contains NaN values.")
    if np.isposinf(signal).any() or np.isneginf(signal).any():
        raise ShmInferenceError("Uploaded SHM signal contains positive or negative infinity.")
    if np.unique(signal).size <= 1:
        raise ShmInferenceError("Uploaded SHM signal is constant and cannot be scored.")
    if len(signal) != EXPECTED_SIGNAL_LENGTH:
        raise ShmInferenceError(
            f"Uploaded SHM signal has {len(signal)} rows. This model expects "
            f"{EXPECTED_SIGNAL_LENGTH} rows, matching the official SHM segment format."
        )

    return path


def predict_shm_file(file_path: str | Path) -> dict[str, float | str]:
    """Predict cumulative fatigue damage for one uploaded SHM CSV file.

    The filename is never used as a model feature. The prediction uses the final
    physics-informed coefficient and fatigue_power_5 extracted from the full
    raw signal via extract_features_for_file().
    """
    validated_path = validate_uploaded_signal_file(file_path)
    metadata = load_model_metadata()
    features = extract_features_for_file(validated_path)

    fatigue_power_5 = float(features[SELECTED_FEATURE])
    if not np.isfinite(fatigue_power_5) or fatigue_power_5 <= 0:
        raise ShmInferenceError(
            "Extracted fatigue_power_5 is not positive and finite; cannot predict."
        )

    prediction = float(metadata["fitted_k"] * fatigue_power_5)
    if not np.isfinite(prediction) or prediction <= 0:
        raise ShmInferenceError("SHM prediction is not positive and finite.")

    return {
        "prediction": prediction,
        "fatigue_power_5": fatigue_power_5,
        "model_name": str(metadata["model_name"]),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Predict SHM damage for one CSV file.")
    parser.add_argument("file_path", type=Path, help="Path to one uploaded SHM CSV file.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        result = predict_shm_file(args.file_path)
    except ShmInferenceError as exc:
        raise SystemExit(f"SHM inference failed: {exc}") from exc

    print("SHM single-file inference")
    print("=========================")
    print(f"filename: {Path(args.file_path).name}")
    print(f"fatigue_power_5: {result['fatigue_power_5']}")
    print(f"predicted cumulative damage: {result['prediction']}")


if __name__ == "__main__":
    main()
