import pytest
from pathlib import Path
import pandas as pd
from src.common.config import SAMPLE_SUBMISSION_DIR, OUTPUTS_DIR
from src.common.submission import (
    validate_door_predictions,
    validate_acv_predictions,
    validate_rail_predictions,
    validate_shm_predictions,
    package_submission,
)

def test_sample_submissions_valid():
    door_df = pd.read_csv(SAMPLE_SUBMISSION_DIR / "door_predictions.csv")
    valid, msg = validate_door_predictions(door_df)
    assert valid, f"Door sample invalid: {msg}"

    acv_df = pd.read_csv(SAMPLE_SUBMISSION_DIR / "acv_predictions.csv")
    valid, msg = validate_acv_predictions(acv_df)
    assert valid, f"ACV sample invalid: {msg}"

    rail_df = pd.read_csv(SAMPLE_SUBMISSION_DIR / "rail_predictions.csv")
    valid, msg = validate_rail_predictions(rail_df)
    assert valid, f"Rail sample invalid: {msg}"

    shm_df = pd.read_csv(SAMPLE_SUBMISSION_DIR / "shm_predictions.csv")
    valid, msg = validate_shm_predictions(shm_df)
    assert valid, f"SHM sample invalid: {msg}"

def test_package_submission():
    zip_path = OUTPUTS_DIR / "test_predictions.zip"
    results = package_submission(SAMPLE_SUBMISSION_DIR, zip_path)
    assert len(results) == 4
    assert zip_path.exists()
    import zipfile
    with zipfile.ZipFile(zip_path, "r") as zf:
        namelist = zf.namelist()
        assert "door_predictions.csv" in namelist
        assert "acv_predictions.csv" in namelist
        assert "rail_predictions.csv" in namelist
        assert "shm_predictions.csv" in namelist
    # Clean up test zip
    zip_path.unlink()
