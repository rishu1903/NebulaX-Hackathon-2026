from __future__ import annotations

import sys
from io import StringIO
from pathlib import Path

import pandas as pd
import pytest


WORK_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = WORK_ROOT / "src"
REPO_ROOT = WORK_ROOT.parents[1]
DATA_ROOT = REPO_ROOT / "PS3" / "02_Datasets" / "SHM"
TEST_FILE = DATA_ROOT / "Test" / "test01.csv"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

import shm_app_adapter  # noqa: E402
from shm_app_adapter import (  # noqa: E402
    ShmAppAdapterError,
    prediction_result_to_submission_csv,
    predict_shm_upload,
)
from shm_inference import predict_shm_file  # noqa: E402


def test_valid_uploaded_csv_bytes_match_file_inference() -> None:
    file_bytes = TEST_FILE.read_bytes()

    upload_result = predict_shm_upload(file_bytes, "uploaded_signal.csv")
    direct_result = predict_shm_file(TEST_FILE)

    assert upload_result["subsystem"] == "SHM"
    assert upload_result["file_id"] == "uploaded_signal.csv"
    assert upload_result["model_name"] == direct_result["model_name"]
    assert upload_result["prediction"] == pytest.approx(
        direct_result["prediction"],
        rel=1e-15,
        abs=1e-12,
    )
    assert upload_result["technical_details"]["fatigue_power_5"] == pytest.approx(
        direct_result["fatigue_power_5"],
        rel=1e-15,
        abs=1e-6,
    )


def test_downloadable_submission_csv_has_official_schema() -> None:
    result = {
        "subsystem": "SHM",
        "file_id": "test01.csv",
        "prediction": 0.123,
        "model_name": "Physics_k_times_fatigue_power_5",
        "technical_details": {"fatigue_power_5": 123.0},
    }

    csv_text = prediction_result_to_submission_csv(result)
    parsed = pd.read_csv(StringIO(csv_text))

    assert csv_text.splitlines()[0] == "file_id,prediction"
    assert list(parsed.columns) == ["file_id", "prediction"]
    assert parsed.shape == (1, 2)
    assert parsed.loc[0, "file_id"] == "test01.csv"
    assert parsed.loc[0, "prediction"] == pytest.approx(0.123)


def test_malformed_upload_fails_cleanly() -> None:
    values = [str(index) for index in range(1_001)]
    values[-1] = "not-a-number"
    file_bytes = ("\n".join(values) + "\n").encode("utf-8")

    with pytest.raises(ShmAppAdapterError, match="non-numeric values"):
        predict_shm_upload(file_bytes, "bad.csv")


def test_unsupported_file_type_fails_before_inference() -> None:
    with pytest.raises(ShmAppAdapterError, match="Unsupported file type"):
        predict_shm_upload(b"1.0\n2.0\n", "signal.txt")


def test_temporary_upload_file_is_cleaned_up(monkeypatch: pytest.MonkeyPatch) -> None:
    captured_temp_path: dict[str, Path] = {}

    def fake_predict_shm_file(temp_path: Path) -> dict[str, float | str]:
        captured_temp_path["path"] = Path(temp_path)
        assert captured_temp_path["path"].exists()
        return {
            "prediction": 0.5,
            "fatigue_power_5": 10.0,
            "model_name": "fake_model",
        }

    monkeypatch.setattr(shm_app_adapter, "predict_shm_file", fake_predict_shm_file)

    result = predict_shm_upload(b"1.0\n2.0\n", "temporary.csv")

    assert result["prediction"] == pytest.approx(0.5)
    assert "path" in captured_temp_path
    assert not captured_temp_path["path"].exists()
    assert not captured_temp_path["path"].parent.exists()


def test_original_filename_does_not_affect_prediction() -> None:
    file_bytes = TEST_FILE.read_bytes()

    first = predict_shm_upload(file_bytes, "first_name.csv")
    second = predict_shm_upload(file_bytes, "totally_different_name.csv")

    assert first["file_id"] == "first_name.csv"
    assert second["file_id"] == "totally_different_name.csv"
    assert first["prediction"] == pytest.approx(second["prediction"], rel=1e-15, abs=1e-12)
    assert first["technical_details"]["fatigue_power_5"] == pytest.approx(
        second["technical_details"]["fatigue_power_5"],
        rel=1e-15,
        abs=1e-6,
    )
