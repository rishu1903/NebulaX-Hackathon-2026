import io
import zipfile
from pathlib import Path
import pandas as pd
from typing import Dict, List, Tuple

VALID_DOOR_LABELS = {"Normal", "Abnormal resistance"}
VALID_RAIL_LABELS = {"Normal", "Side I", "Side II"}

def validate_door_predictions(df: pd.DataFrame) -> Tuple[bool, str]:
    required_cols = ["start_time", "end_time", "prediction"]
    if list(df.columns) != required_cols:
        return False, f"Expected columns {required_cols}, got {list(df.columns)}"
    if len(df) == 0:
        return False, "Door predictions cannot be empty"
    invalid_labels = set(df["prediction"].unique()) - VALID_DOOR_LABELS
    if invalid_labels:
        return False, f"Invalid door prediction labels found: {invalid_labels}"
    return True, "Valid"

def validate_acv_predictions(df: pd.DataFrame) -> Tuple[bool, str]:
    required_cols = ["file_id", "ranked_cars"]
    if list(df.columns) != required_cols:
        return False, f"Expected columns {required_cols}, got {list(df.columns)}"
    if len(df) == 0:
        return False, "ACV predictions cannot be empty"
    for _, row in df.iterrows():
        cars = str(row["ranked_cars"]).split("|")
        if len(cars) != 8:
            return False, f"Row {row['file_id']} does not have 8 ranked cars: {cars}"
    return True, "Valid"

def validate_rail_predictions(df: pd.DataFrame) -> Tuple[bool, str]:
    required_cols = ["file_id", "prediction"]
    if list(df.columns) != required_cols:
        return False, f"Expected columns {required_cols}, got {list(df.columns)}"
    if len(df) == 0:
        return False, "Rail predictions cannot be empty"
    invalid_labels = set(df["prediction"].unique()) - VALID_RAIL_LABELS
    if invalid_labels:
        return False, f"Invalid rail prediction labels found: {invalid_labels}"
    return True, "Valid"

def validate_shm_predictions(df: pd.DataFrame) -> Tuple[bool, str]:
    required_cols = ["file_id", "prediction"]
    if list(df.columns) != required_cols:
        return False, f"Expected columns {required_cols}, got {list(df.columns)}"
    if len(df) == 0:
        return False, "SHM predictions cannot be empty"
    try:
        pd.to_numeric(df["prediction"])
    except Exception:
        return False, "Non-numeric values found in SHM prediction column"
    return True, "Valid"

VALIDATORS = {
    "door_predictions.csv": validate_door_predictions,
    "acv_predictions.csv": validate_acv_predictions,
    "rail_predictions.csv": validate_rail_predictions,
    "shm_predictions.csv": validate_shm_predictions,
}

def package_submission(output_dir: Path, zip_path: Path) -> Dict[str, str]:
    """
    Validates CSV files in output_dir and packages them into predictions.zip
    at the root level (no subfolders).
    """
    results = {}
    csv_files_to_pack = {}

    for filename, validator in VALIDATORS.items():
        csv_path = output_dir / filename
        if csv_path.exists():
            df = pd.read_csv(csv_path)
            is_valid, msg = validator(df)
            if not is_valid:
                raise ValueError(f"Validation failed for {filename}: {msg}")
            csv_files_to_pack[filename] = csv_path
            results[filename] = f"Valid ({len(df)} rows)"
        else:
            results[filename] = "Not found (skipped)"

    if not csv_files_to_pack:
        raise ValueError("No prediction CSV files found to package!")

    # Package into zip at top level
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for fname, fpath in csv_files_to_pack.items():
            zf.write(fpath, arcname=fname)

    return results
