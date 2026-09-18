"""Read-only audit for the SHM dynamic stress dataset.

This script validates file/label alignment and records per-file signal quality
statistics. It never modifies raw files in PS3/02_Datasets/SHM/.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd


OUTPUT_DIR = Path(__file__).resolve().parents[1] / "outputs"
AUDIT_OUTPUT_PATH = OUTPUT_DIR / "shm_audit.csv"

EXPECTED_TRAIN_FILES = 64
EXPECTED_ROW_COUNT = 581_120
RAW_COLUMN = "raw_value"
NA_TOKENS = {"", "nan", "na", "n/a", "null", "none"}


@dataclass(frozen=True)
class LabelAudit:
    labels: pd.DataFrame
    duplicate_label_filenames: list[str]
    missing_labels: list[str]
    unexpected_label_rows: list[str]


@dataclass(frozen=True)
class ShmDataPaths:
    data_root: Path
    train_dir: Path
    test_dir: Path
    labels_path: Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a read-only audit of the SHM raw dataset."
    )
    parser.add_argument(
        "--data-root",
        required=True,
        type=Path,
        help="Path to the SHM dataset root containing Train/, Test/, and Train_Labels.csv.",
    )
    return parser.parse_args()


def validate_data_root(data_root: Path) -> ShmDataPaths:
    """Validate the external SHM data root supplied by the caller."""
    resolved_root = data_root.expanduser().resolve()
    train_dir = resolved_root / "Train"
    test_dir = resolved_root / "Test"
    labels_path = resolved_root / "Train_Labels.csv"

    missing_paths = [
        path
        for path in (resolved_root, train_dir, test_dir, labels_path)
        if not path.exists()
    ]
    if missing_paths:
        missing = "\n  ".join(str(path) for path in missing_paths)
        raise SystemExit(
            "Invalid --data-root. Expected a directory containing Train/, Test/, "
            f"and Train_Labels.csv. Missing:\n  {missing}"
        )
    if not train_dir.is_dir() or not test_dir.is_dir() or not labels_path.is_file():
        raise SystemExit(
            "Invalid --data-root. Train and Test must be directories, and "
            "Train_Labels.csv must be a file."
        )

    return ShmDataPaths(
        data_root=resolved_root,
        train_dir=train_dir,
        test_dir=test_dir,
        labels_path=labels_path,
    )


def discover_csv_files(directory: Path) -> list[Path]:
    """Return all CSV files in a directory, sorted by filename."""
    return sorted(directory.glob("*.csv"), key=lambda path: path.name.lower())


def load_labels(labels_path: Path) -> pd.DataFrame:
    """Load Train_Labels.csv and validate its required columns."""
    labels = pd.read_csv(labels_path)
    required_columns = {"filename", "damage"}
    missing_columns = required_columns - set(labels.columns)
    if missing_columns:
        raise ValueError(
            f"{labels_path} is missing required columns: {sorted(missing_columns)}"
        )
    return labels


def audit_labels(labels: pd.DataFrame, train_files: list[Path]) -> LabelAudit:
    """Check that every train file has exactly one label and no labels are duplicated."""
    label_counts = labels["filename"].value_counts()
    duplicate_label_filenames = sorted(label_counts[label_counts > 1].index.tolist())

    train_file_names = {path.name for path in train_files}
    label_file_names = set(labels["filename"].astype(str))

    missing_labels = sorted(train_file_names - label_file_names)
    unexpected_label_rows = sorted(label_file_names - train_file_names)

    return LabelAudit(
        labels=labels,
        duplicate_label_filenames=duplicate_label_filenames,
        missing_labels=missing_labels,
        unexpected_label_rows=unexpected_label_rows,
    )


def read_signal_as_strings(file_path: Path) -> pd.Series:
    """Read a headerless signal file as one raw string column."""
    df = pd.read_csv(
        file_path,
        header=None,
        names=[RAW_COLUMN],
        dtype=str,
        keep_default_na=False,
        na_filter=False,
    )
    if list(df.columns) != [RAW_COLUMN]:
        raise ValueError(f"{file_path.name}: expected exactly one column")
    return df[RAW_COLUMN]


def audit_signal_file(
    file_path: Path,
    data_root: Path,
    split: str,
    damage: float | None = None,
) -> dict:
    """Compute read-only quality and descriptive statistics for one signal file."""
    raw_values = read_signal_as_strings(file_path)
    stripped = raw_values.str.strip()
    normalized = stripped.str.lower()
    numeric_values = pd.to_numeric(stripped, errors="coerce")
    numeric_array = numeric_values.to_numpy(dtype=float)

    na_mask = normalized.isin(NA_TOKENS)
    non_numeric_mask = numeric_values.isna() & ~na_mask
    pos_inf_mask = np.isposinf(numeric_array)
    neg_inf_mask = np.isneginf(numeric_array)
    finite_mask = np.isfinite(numeric_array)
    finite_values = numeric_array[finite_mask]

    if finite_values.size:
        minimum = float(np.min(finite_values))
        maximum = float(np.max(finite_values))
        mean = float(np.mean(finite_values))
        median = float(np.median(finite_values))
        std = float(np.std(finite_values))
        rms = float(np.sqrt(np.mean(finite_values**2)))
        unique_values = int(pd.Series(finite_values).nunique())
        exact_zeros = int(np.sum(finite_values == 0.0))
        is_constant = unique_values == 1
    else:
        minimum = maximum = mean = median = std = rms = np.nan
        unique_values = 0
        exact_zeros = 0
        is_constant = False

    row_count = int(len(raw_values))
    return {
        "split": split,
        "file_id": file_path.name,
        "path": file_path.relative_to(data_root).as_posix(),
        "damage": damage,
        "row_count": row_count,
        "unexpected_row_count": row_count != EXPECTED_ROW_COUNT,
        "nan_count": int(na_mask.sum()),
        "pos_inf_count": int(pos_inf_mask.sum()),
        "neg_inf_count": int(neg_inf_mask.sum()),
        "inf_count": int(pos_inf_mask.sum() + neg_inf_mask.sum()),
        "non_numeric_count": int(non_numeric_mask.sum()),
        "min": minimum,
        "max": maximum,
        "mean": mean,
        "median": median,
        "std": std,
        "rms": rms,
        "unique_values": unique_values,
        "exact_zero_count": exact_zeros,
        "is_constant": bool(is_constant),
    }


def build_audit_dataframe(
    train_files: list[Path],
    test_files: list[Path],
    labels: pd.DataFrame,
    data_root: Path,
) -> pd.DataFrame:
    """Build one audit row per source train/test signal file."""
    damage_by_filename = labels.set_index("filename")["damage"].to_dict()
    records = []

    for file_path in train_files:
        records.append(
            audit_signal_file(
                file_path=file_path,
                data_root=data_root,
                split="train",
                damage=damage_by_filename.get(file_path.name),
            )
        )

    for file_path in test_files:
        records.append(
            audit_signal_file(file_path=file_path, data_root=data_root, split="test")
        )

    return pd.DataFrame(records)


def print_summary(
    audit_df: pd.DataFrame,
    train_files: list[Path],
    test_files: list[Path],
    label_audit: LabelAudit,
) -> None:
    """Print a concise terminal summary for humans."""
    unexpected_row_files = audit_df.loc[
        audit_df["unexpected_row_count"], "file_id"
    ].tolist()
    data_issue_files = audit_df.loc[
        (audit_df["nan_count"] > 0)
        | (audit_df["inf_count"] > 0)
        | (audit_df["non_numeric_count"] > 0),
        "file_id",
    ].tolist()
    constant_files = audit_df.loc[audit_df["is_constant"], "file_id"].tolist()

    unexpected_files = []
    if len(train_files) != EXPECTED_TRAIN_FILES:
        unexpected_files.append(
            f"expected {EXPECTED_TRAIN_FILES} train files, found {len(train_files)}"
        )
    unexpected_files.extend(
        f"label without train file: {name}" for name in label_audit.unexpected_label_rows
    )

    print("SHM audit summary")
    print("=================")
    print(f"Train files: {len(train_files)}")
    print(f"Test files: {len(test_files)}")
    print(f"Missing labels: {label_audit.missing_labels or 'None'}")
    print(f"Duplicate labels: {label_audit.duplicate_label_filenames or 'None'}")
    print(f"Unexpected files: {unexpected_files or 'None'}")
    print(f"Files with unexpected row counts: {unexpected_row_files or 'None'}")
    print(f"Files containing NaN/Inf/non-numeric values: {data_issue_files or 'None'}")
    print(f"Constant files: {constant_files or 'None'}")
    print(f"Audit CSV: {AUDIT_OUTPUT_PATH}")


def main() -> None:
    args = parse_args()
    paths = validate_data_root(args.data_root)

    train_files = discover_csv_files(paths.train_dir)
    test_files = discover_csv_files(paths.test_dir)
    labels = load_labels(paths.labels_path)
    label_audit = audit_labels(labels, train_files)

    audit_df = build_audit_dataframe(
        train_files,
        test_files,
        label_audit.labels,
        paths.data_root,
    )
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    audit_df.to_csv(AUDIT_OUTPUT_PATH, index=False)

    print_summary(audit_df, train_files, test_files, label_audit)


if __name__ == "__main__":
    main()
