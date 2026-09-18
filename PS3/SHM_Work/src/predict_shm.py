"""Final SHM inference pipeline.

Fits the selected physics-informed model on all labelled training files and
predicts cumulative fatigue damage for the official SHM test files.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from time import perf_counter

import numpy as np
import pandas as pd

from extract_shm_features import (
    extract_features_for_file,
    load_labels,
    validate_data_root,
)


WORK_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = WORK_ROOT / "outputs"
SUBMISSION_DIR = OUTPUT_DIR / "submission"
MODELING_RESULTS_PATH = OUTPUT_DIR / "modeling" / "shm_cv_model_results.csv"

PREDICTIONS_PATH = SUBMISSION_DIR / "shm_test_predictions.csv"
SUBMISSION_PREDICTIONS_PATH = SUBMISSION_DIR / "shm_predictions.csv"
METADATA_PATH = SUBMISSION_DIR / "shm_final_model_metadata.json"

MODEL_NAME = "Physics_k_times_fatigue_power_5"
SELECTED_FEATURE = "fatigue_power_5"
EXPECTED_TRAIN_FILES = 64
EXPECTED_TEST_FILES = 16
DEFAULT_CV_MEAN_MAPE = 0.026414
DEFAULT_CV_MEAN_COMPETITION_SCORE = 0.973586


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate final SHM test predictions.")
    parser.add_argument(
        "--data-root",
        required=True,
        type=Path,
        help="Path to the SHM dataset root containing Train/, Test/, and Train_Labels.csv.",
    )
    return parser.parse_args()


def natural_sort_key(path: Path) -> tuple[str, int]:
    """Sort files as test01.csv, test02.csv, ..., test16.csv."""
    match = re.search(r"(\d+)", path.stem)
    number = int(match.group(1)) if match else -1
    prefix = re.sub(r"\d+", "", path.stem)
    return prefix.lower(), number


def discover_signal_files(directory: Path) -> list[Path]:
    return sorted(directory.glob("*.csv"), key=natural_sort_key)


def extract_feature_rows(file_paths: list[Path]) -> pd.DataFrame:
    records = []
    for file_path in file_paths:
        start_time = perf_counter()
        features = extract_features_for_file(file_path)
        records.append(
            {
                "filename": str(features["filename"]),
                SELECTED_FEATURE: float(features[SELECTED_FEATURE]),
            }
        )
        elapsed = perf_counter() - start_time
        print(f"Processed {file_path.name} in {elapsed:.2f}s")
    return pd.DataFrame(records)


def build_training_table(train_dir: Path, labels_path: Path) -> pd.DataFrame:
    train_files = discover_signal_files(train_dir)
    if len(train_files) != EXPECTED_TRAIN_FILES:
        raise ValueError(
            f"Expected {EXPECTED_TRAIN_FILES} train files, got {len(train_files)}"
        )

    labels = load_labels(labels_path)
    if labels["filename"].duplicated().any():
        duplicates = labels.loc[labels["filename"].duplicated(), "filename"].tolist()
        raise ValueError(f"Duplicate training labels found: {duplicates}")

    features = extract_feature_rows(train_files)
    train_table = features.merge(labels, on="filename", how="left", validate="one_to_one")
    if train_table["damage"].isna().any():
        missing = train_table.loc[train_table["damage"].isna(), "filename"].tolist()
        raise ValueError(f"Missing labels for training files: {missing}")
    if not (train_table["damage"] > 0).all():
        bad_files = train_table.loc[train_table["damage"] <= 0, "filename"].tolist()
        raise ValueError(f"Training damage must be positive. Invalid files: {bad_files}")
    if not np.all(np.isfinite(train_table[[SELECTED_FEATURE, "damage"]].to_numpy())):
        raise ValueError("Training table contains NaN or infinity")
    return train_table


def fit_physics_coefficient(train_table: pd.DataFrame) -> float:
    x = train_table[SELECTED_FEATURE].to_numpy(dtype=float)
    y = train_table["damage"].to_numpy(dtype=float)
    denominator = float(np.sum(x**2))
    if denominator <= 0:
        raise ValueError("Cannot fit physics coefficient: zero denominator")
    return float(np.sum(x * y) / denominator)


def predict_test(test_dir: Path, fitted_k: float) -> pd.DataFrame:
    test_files = discover_signal_files(test_dir)
    if len(test_files) != EXPECTED_TEST_FILES:
        raise ValueError(f"Expected {EXPECTED_TEST_FILES} test files, got {len(test_files)}")

    features = extract_feature_rows(test_files)
    if features["filename"].duplicated().any():
        duplicates = features.loc[features["filename"].duplicated(), "filename"].tolist()
        raise ValueError(f"Duplicate test filenames found: {duplicates}")
    if not np.all(np.isfinite(features[SELECTED_FEATURE].to_numpy(dtype=float))):
        raise ValueError("Test fatigue_power_5 contains NaN or infinity")

    predictions = features.copy()
    predictions["predicted_damage"] = fitted_k * predictions[SELECTED_FEATURE]
    if not np.all(np.isfinite(predictions["predicted_damage"].to_numpy(dtype=float))):
        raise ValueError("Predictions contain NaN or infinity")
    if not (predictions["predicted_damage"] > 0).all():
        bad_files = predictions.loc[
            predictions["predicted_damage"] <= 0, "filename"
        ].tolist()
        raise ValueError(f"Predictions must be positive. Invalid files: {bad_files}")

    predictions["sort_key"] = predictions["filename"].map(lambda value: natural_sort_key(Path(value)))
    predictions = predictions.sort_values("sort_key").drop(columns=["sort_key"])
    return predictions.reset_index(drop=True)


def load_cv_metadata(results_path: Path) -> tuple[float, float]:
    if not results_path.exists():
        return DEFAULT_CV_MEAN_MAPE, DEFAULT_CV_MEAN_COMPETITION_SCORE

    results = pd.read_csv(results_path)
    rows = results[
        (results["model"] == MODEL_NAME)
        & (results["feature_set"] == f"SINGLE_{SELECTED_FEATURE}")
        & (results["target_transform"] == "direct")
    ]
    if rows.empty:
        return DEFAULT_CV_MEAN_MAPE, DEFAULT_CV_MEAN_COMPETITION_SCORE

    row = rows.iloc[0]
    return float(row["mean_mape"]), float(row["mean_competition_score"])


def save_predictions(predictions: pd.DataFrame) -> None:
    internal_output = predictions[["filename", "predicted_damage"]].copy()
    internal_output.to_csv(PREDICTIONS_PATH, index=False)

    submission_output = predictions[["filename", "predicted_damage"]].rename(
        columns={"filename": "file_id", "predicted_damage": "prediction"}
    )
    validate_submission_predictions(submission_output)
    submission_output.to_csv(SUBMISSION_PREDICTIONS_PATH, index=False)


def validate_submission_predictions(submission: pd.DataFrame) -> None:
    """Validate the official SHM submission schema and prediction values."""
    expected_columns = ["file_id", "prediction"]
    if list(submission.columns) != expected_columns:
        raise ValueError(
            f"Submission columns must be exactly {expected_columns}, "
            f"got {list(submission.columns)}"
        )
    if len(submission) != EXPECTED_TEST_FILES:
        raise ValueError(
            f"Expected {EXPECTED_TEST_FILES} submission rows, got {len(submission)}"
        )
    if submission["file_id"].duplicated().any():
        duplicates = submission.loc[submission["file_id"].duplicated(), "file_id"].tolist()
        raise ValueError(f"Duplicate file_id values found: {duplicates}")

    predictions = submission["prediction"].to_numpy(dtype=float)
    if not np.all(np.isfinite(predictions)):
        raise ValueError("Submission predictions contain NaN or infinity")
    if not (predictions > 0).all():
        bad_files = submission.loc[submission["prediction"] <= 0, "file_id"].tolist()
        raise ValueError(f"Submission predictions must be positive. Invalid files: {bad_files}")

    expected_file_ids = [f"test{index:02d}.csv" for index in range(1, EXPECTED_TEST_FILES + 1)]
    actual_file_ids = submission["file_id"].tolist()
    if actual_file_ids != expected_file_ids:
        raise ValueError(
            "Submission files must be naturally sorted test01.csv through "
            f"test16.csv. Got: {actual_file_ids}"
        )


def save_metadata(fitted_k: float, training_sample_count: int) -> None:
    cv_mean_mape, cv_mean_score = load_cv_metadata(MODELING_RESULTS_PATH)
    metadata = {
        "model_name": MODEL_NAME,
        "formula": "predicted_damage = fitted_k * fatigue_power_5",
        "fitted_k": fitted_k,
        "training_sample_count": training_sample_count,
        "selected_feature": SELECTED_FEATURE,
        "cross_validation_method": "RepeatedKFold(n_splits=5, n_repeats=20, random_state=42)",
        "cv_mean_mape": cv_mean_mape,
        "cv_mean_competition_score": cv_mean_score,
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def print_terminal_summary(fitted_k: float, predictions: pd.DataFrame) -> None:
    display_table = predictions[["filename", SELECTED_FEATURE, "predicted_damage"]]
    submission = predictions[["filename", "predicted_damage"]].rename(
        columns={"filename": "file_id", "predicted_damage": "prediction"}
    )
    print("\nFinal SHM test predictions")
    print("==========================")
    print(display_table.to_string(index=False))
    print("\nOfficial SHM submission dataframe")
    print("=================================")
    print(submission.to_string(index=False))
    print("\nFinal model summary")
    print("===================")
    print(f"Final fitted k: {fitted_k:.16e}")
    print(f"Minimum predicted damage: {predictions['predicted_damage'].min():.9f}")
    print(f"Maximum predicted damage: {predictions['predicted_damage'].max():.9f}")
    print(f"Mean predicted damage: {predictions['predicted_damage'].mean():.9f}")
    print(f"Median predicted damage: {predictions['predicted_damage'].median():.9f}")
    print(f"Number of test predictions: {len(predictions)}")
    print(f"Official submission CSV: {SUBMISSION_PREDICTIONS_PATH}")
    print(f"Predictions CSV: {PREDICTIONS_PATH}")
    print(f"Metadata JSON: {METADATA_PATH}")


def main() -> None:
    args = parse_args()
    paths = validate_data_root(args.data_root)
    SUBMISSION_DIR.mkdir(parents=True, exist_ok=True)

    train_table = build_training_table(paths.train_dir, paths.labels_path)
    fitted_k = fit_physics_coefficient(train_table)
    predictions = predict_test(paths.test_dir, fitted_k)

    save_predictions(predictions)
    save_metadata(fitted_k, training_sample_count=len(train_table))
    print_terminal_summary(fitted_k, predictions)


if __name__ == "__main__":
    main()
