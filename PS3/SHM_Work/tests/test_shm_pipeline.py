from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest


WORK_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = WORK_ROOT / "src"
REPO_ROOT = WORK_ROOT.parents[1]
DATA_ROOT = REPO_ROOT / "PS3" / "02_Datasets" / "SHM"
TRAIN_FILE = DATA_ROOT / "Train" / "train13.csv"
TEST_FILE = DATA_ROOT / "Test" / "test01.csv"
METADATA_PATH = WORK_ROOT / "outputs" / "submission" / "shm_final_model_metadata.json"
SUBMISSION_PATH = WORK_ROOT / "outputs" / "submission" / "shm_predictions.csv"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from extract_shm_features import extract_features_for_file  # noqa: E402
from shm_inference import (  # noqa: E402
    MIN_MEANINGFUL_OBSERVATIONS,
    ShmInferenceError,
    predict_shm_file,
)


def write_one_column_csv(path: Path, values: list[object]) -> None:
    pd.DataFrame(values).to_csv(path, index=False, header=False)


def test_inference_reuses_identical_fatigue_power_5_feature() -> None:
    direct_features = extract_features_for_file(TRAIN_FILE)
    inference_result = predict_shm_file(TRAIN_FILE)

    assert inference_result["fatigue_power_5"] == pytest.approx(
        direct_features["fatigue_power_5"],
        rel=1e-15,
        abs=1e-6,
    )


def test_prediction_matches_fitted_k_times_fatigue_power_5() -> None:
    metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    fitted_k = float(metadata["fitted_k"])
    inference_result = predict_shm_file(TRAIN_FILE)

    assert inference_result["prediction"] == pytest.approx(
        fitted_k * inference_result["fatigue_power_5"],
        rel=1e-15,
        abs=1e-12,
    )


def test_test01_prediction_matches_generated_submission() -> None:
    inference_result = predict_shm_file(TEST_FILE)
    submission = pd.read_csv(SUBMISSION_PATH)
    expected_prediction = submission.loc[
        submission["file_id"] == "test01.csv",
        "prediction",
    ].iloc[0]

    assert inference_result["prediction"] == pytest.approx(
        expected_prediction,
        rel=1e-15,
        abs=1e-12,
    )


def test_missing_file_fails_with_clear_error(tmp_path: Path) -> None:
    missing_file = tmp_path / "missing.csv"

    with pytest.raises(ShmInferenceError, match="does not exist"):
        predict_shm_file(missing_file)


def test_non_csv_extension_fails(tmp_path: Path) -> None:
    bad_file = tmp_path / "signal.txt"
    bad_file.write_text("1.0\n2.0\n", encoding="utf-8")

    with pytest.raises(ShmInferenceError, match=r"\.csv"):
        predict_shm_file(bad_file)


def test_multi_column_csv_fails(tmp_path: Path) -> None:
    bad_file = tmp_path / "multi_column.csv"
    pd.DataFrame({"a": [1.0, 2.0], "b": [3.0, 4.0]}).to_csv(
        bad_file,
        index=False,
        header=False,
    )

    with pytest.raises(ShmInferenceError, match="exactly one signal column"):
        predict_shm_file(bad_file)


def test_non_numeric_values_fail(tmp_path: Path) -> None:
    bad_file = tmp_path / "non_numeric.csv"
    values = list(np.linspace(0.0, 1.0, MIN_MEANINGFUL_OBSERVATIONS))
    values[-1] = "not-a-number"
    write_one_column_csv(bad_file, values)

    with pytest.raises(ShmInferenceError, match="only numeric values"):
        predict_shm_file(bad_file)


def test_nan_values_fail(tmp_path: Path) -> None:
    bad_file = tmp_path / "nan.csv"
    values = list(np.linspace(0.0, 1.0, MIN_MEANINGFUL_OBSERVATIONS))
    values[-1] = np.nan
    write_one_column_csv(bad_file, values)

    with pytest.raises(ShmInferenceError, match="NaN"):
        predict_shm_file(bad_file)


def test_inf_values_fail(tmp_path: Path) -> None:
    bad_file = tmp_path / "inf.csv"
    values = list(np.linspace(0.0, 1.0, MIN_MEANINGFUL_OBSERVATIONS))
    values[-1] = np.inf
    write_one_column_csv(bad_file, values)

    with pytest.raises(ShmInferenceError, match="infinity"):
        predict_shm_file(bad_file)


def test_constant_signal_fails(tmp_path: Path) -> None:
    bad_file = tmp_path / "constant.csv"
    write_one_column_csv(bad_file, [1.0] * MIN_MEANINGFUL_OBSERVATIONS)

    with pytest.raises(ShmInferenceError, match="constant"):
        predict_shm_file(bad_file)
