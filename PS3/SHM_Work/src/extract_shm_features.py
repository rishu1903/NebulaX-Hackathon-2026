"""Fatigue-specific feature extraction for SHM training signals.

This script reads raw SHM train files and writes a derived feature table. It
does not modify, downsample, clip, normalize, or overwrite raw signal files.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter

import numpy as np
import pandas as pd
import rainflow


OUTPUT_DIR = Path(__file__).resolve().parents[1] / "outputs"
FEATURE_OUTPUT_PATH = OUTPUT_DIR / "shm_features.csv"

EXPECTED_TRAIN_ROWS = 64
EXPECTED_SIGNAL_LENGTH = 581_120
FATIGUE_POWERS = range(2, 9)
LARGE_CYCLE_QUANTILES = {
    "q75": 75,
    "q90": 90,
    "q95": 95,
    "q99": 99,
}


@dataclass(frozen=True)
class ShmDataPaths:
    data_root: Path
    train_dir: Path
    test_dir: Path
    labels_path: Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract read-only SHM features from an external raw dataset."
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


def discover_train_files(train_dir: Path) -> list[Path]:
    """Return train CSV files sorted by filename."""
    return sorted(train_dir.glob("*.csv"), key=lambda path: path.name.lower())


def load_labels(labels_path: Path) -> pd.DataFrame:
    """Load train labels and enforce the required schema."""
    labels = pd.read_csv(labels_path)
    required_columns = {"filename", "damage"}
    missing_columns = required_columns - set(labels.columns)
    if missing_columns:
        raise ValueError(f"Train labels missing columns: {sorted(missing_columns)}")
    return labels[["filename", "damage"]].copy()


def load_signal(file_path: Path) -> np.ndarray:
    """Read a raw headerless one-column signal as float values."""
    values = pd.read_csv(file_path, header=None).iloc[:, 0]
    signal = pd.to_numeric(values, errors="raise").to_numpy(dtype=float)
    if len(signal) != EXPECTED_SIGNAL_LENGTH:
        raise ValueError(
            f"{file_path.name}: expected {EXPECTED_SIGNAL_LENGTH} samples, "
            f"got {len(signal)}"
        )
    if not np.all(np.isfinite(signal)):
        raise ValueError(f"{file_path.name}: signal contains NaN or infinity")
    return signal


def calculate_basic_features(signal: np.ndarray) -> dict[str, float]:
    """Calculate full-signal descriptive statistics."""
    abs_signal = np.abs(signal)
    return {
        "mean": float(np.mean(signal)),
        "median": float(np.median(signal)),
        "std": float(np.std(signal)),
        "variance": float(np.var(signal)),
        "minimum": float(np.min(signal)),
        "maximum": float(np.max(signal)),
        "peak_to_peak": float(np.ptp(signal)),
        "rms": float(np.sqrt(np.mean(signal**2))),
        "mean_absolute_value": float(np.mean(abs_signal)),
        "maximum_absolute_value": float(np.max(abs_signal)),
        "skewness": float(pd.Series(signal).skew()),
        "kurtosis": float(pd.Series(signal).kurt()),
        "q01": float(np.percentile(signal, 1)),
        "q05": float(np.percentile(signal, 5)),
        "q25": float(np.percentile(signal, 25)),
        "q75": float(np.percentile(signal, 75)),
        "q95": float(np.percentile(signal, 95)),
        "q99": float(np.percentile(signal, 99)),
        "abs_q50": float(np.percentile(abs_signal, 50)),
        "abs_q90": float(np.percentile(abs_signal, 90)),
        "abs_q95": float(np.percentile(abs_signal, 95)),
        "abs_q99": float(np.percentile(abs_signal, 99)),
        "abs_q999": float(np.percentile(abs_signal, 99.9)),
    }


def calculate_temporal_features(signal: np.ndarray) -> dict[str, float]:
    """Calculate temporal difference and sign-change statistics."""
    diffs = np.diff(signal)
    abs_diffs = np.abs(diffs)
    diff_signs = np.sign(diffs)
    turning_points = np.sum(diff_signs[1:] * diff_signs[:-1] < 0)
    zero_crossings = np.sum(signal[1:] * signal[:-1] < 0)

    return {
        "mean_absolute_diff": float(np.mean(abs_diffs)),
        "std_diff": float(np.std(diffs)),
        "rms_diff": float(np.sqrt(np.mean(diffs**2))),
        "max_absolute_diff": float(np.max(abs_diffs)),
        "zero_crossing_count": float(zero_crossings),
        "turning_point_count": float(turning_points),
    }


def extract_rainflow_ranges_and_counts(signal: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Extract rainflow cycle ranges and counts from the full raw signal."""
    cycles = list(rainflow.extract_cycles(signal))
    if not cycles:
        return np.array([], dtype=float), np.array([], dtype=float)

    ranges = np.array([cycle[0] for cycle in cycles], dtype=float)
    counts = np.array([cycle[2] for cycle in cycles], dtype=float)
    return ranges, counts


def calculate_rainflow_features(signal: np.ndarray) -> dict[str, float]:
    """Calculate cycle-range, fatigue-power, and large-cycle features."""
    ranges, counts = extract_rainflow_ranges_and_counts(signal)

    if ranges.size == 0:
        features = {
            "rainflow_cycle_count": 0.0,
            "rainflow_total_count": 0.0,
            "range_mean": 0.0,
            "range_std": 0.0,
            "range_median": 0.0,
            "range_max": 0.0,
            "range_q75": 0.0,
            "range_q90": 0.0,
            "range_q95": 0.0,
            "range_q99": 0.0,
            "weighted_range_mean": 0.0,
        }
        for power in FATIGUE_POWERS:
            features[f"fatigue_power_{power}"] = 0.0
            features[f"fatigue_power_{power}_per_cycle"] = 0.0
        for label in LARGE_CYCLE_QUANTILES:
            features[f"large_cycle_count_above_{label}"] = 0.0
            features[f"large_cycle_weighted_count_above_{label}"] = 0.0
        return features

    total_count = float(np.sum(counts))
    features = {
        "rainflow_cycle_count": float(len(ranges)),
        "rainflow_total_count": total_count,
        "range_mean": float(np.mean(ranges)),
        "range_std": float(np.std(ranges)),
        "range_median": float(np.median(ranges)),
        "range_max": float(np.max(ranges)),
        "range_q75": float(np.percentile(ranges, 75)),
        "range_q90": float(np.percentile(ranges, 90)),
        "range_q95": float(np.percentile(ranges, 95)),
        "range_q99": float(np.percentile(ranges, 99)),
        "weighted_range_mean": float(np.average(ranges, weights=counts)),
    }

    for power in FATIGUE_POWERS:
        fatigue_value = float(np.sum(counts * np.power(ranges, power)))
        features[f"fatigue_power_{power}"] = fatigue_value
        features[f"fatigue_power_{power}_per_cycle"] = fatigue_value / total_count

    for label, percentile in LARGE_CYCLE_QUANTILES.items():
        threshold = np.percentile(ranges, percentile)
        large_cycle_mask = ranges > threshold
        features[f"large_cycle_count_above_{label}"] = float(np.sum(large_cycle_mask))
        features[f"large_cycle_weighted_count_above_{label}"] = float(
            np.sum(counts[large_cycle_mask])
        )

    return features


def extract_features_for_file(file_path: Path) -> dict[str, float | str]:
    """Extract all features for one train file."""
    signal = load_signal(file_path)
    features: dict[str, float | str] = {"filename": file_path.name}
    features.update(calculate_basic_features(signal))
    features.update(calculate_temporal_features(signal))
    features.update(calculate_rainflow_features(signal))
    return features


def build_feature_table(train_files: list[Path], labels: pd.DataFrame) -> pd.DataFrame:
    """Build one feature row per train file and join target labels."""
    records = []
    processing_times = []

    for file_path in train_files:
        start_time = perf_counter()
        records.append(extract_features_for_file(file_path))
        elapsed = perf_counter() - start_time
        processing_times.append((file_path.name, elapsed))
        print(f"Processed {file_path.name} in {elapsed:.2f}s")

    features = pd.DataFrame(records)
    feature_table = features.merge(labels, on="filename", how="left", validate="one_to_one")
    feature_table.attrs["processing_times"] = processing_times
    return feature_table


def validate_feature_table(feature_table: pd.DataFrame) -> list[str]:
    """Return validation problems found in the generated feature table."""
    problems = []
    if len(feature_table) != EXPECTED_TRAIN_ROWS:
        problems.append(f"Expected {EXPECTED_TRAIN_ROWS} rows, got {len(feature_table)}")
    if feature_table["filename"].duplicated().any():
        duplicates = feature_table.loc[
            feature_table["filename"].duplicated(), "filename"
        ].tolist()
        problems.append(f"Duplicate filenames in output: {duplicates}")
    if feature_table["damage"].isna().any():
        missing = feature_table.loc[feature_table["damage"].isna(), "filename"].tolist()
        problems.append(f"Missing labels for files: {missing}")

    feature_columns = [
        column for column in feature_table.columns if column not in {"filename", "damage"}
    ]
    feature_values = feature_table[feature_columns]
    nan_columns = feature_values.columns[feature_values.isna().any()].tolist()
    if nan_columns:
        problems.append(f"NaN feature columns: {nan_columns}")

    numeric_values = feature_values.to_numpy(dtype=float)
    if np.isinf(numeric_values).any():
        inf_columns = feature_values.columns[np.isinf(numeric_values).any(axis=0)].tolist()
        problems.append(f"Infinite feature columns: {inf_columns}")

    return problems


def print_summary(feature_table: pd.DataFrame, problems: list[str], elapsed: float) -> None:
    """Print extraction and validation summary."""
    feature_count = len(
        [column for column in feature_table.columns if column not in {"filename", "damage"}]
    )
    processing_times = feature_table.attrs.get("processing_times", [])
    mean_file_time = (
        float(np.mean([seconds for _, seconds in processing_times]))
        if processing_times
        else 0.0
    )

    print("\nSHM feature extraction summary")
    print("==============================")
    print(f"Features created: {feature_count}")
    print(f"Output shape: {feature_table.shape}")
    print(f"Mean processing time per file: {mean_file_time:.2f}s")
    print(f"Total processing time: {elapsed:.2f}s")
    print(f"Output CSV: {FEATURE_OUTPUT_PATH}")
    print("Validation problems:")
    if problems:
        for problem in problems:
            print(f"  - {problem}")
    else:
        print("  None")


def main() -> None:
    args = parse_args()
    paths = validate_data_root(args.data_root)

    start_time = perf_counter()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    train_files = discover_train_files(paths.train_dir)
    labels = load_labels(paths.labels_path)
    feature_table = build_feature_table(train_files, labels)
    problems = validate_feature_table(feature_table)

    feature_table.to_csv(FEATURE_OUTPUT_PATH, index=False)
    print_summary(feature_table, problems, perf_counter() - start_time)


if __name__ == "__main__":
    main()
