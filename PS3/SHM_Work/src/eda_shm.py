"""Exploratory data analysis for the SHM training dataset.

This script reads the raw SHM files without modifying them. Downsampling is
used only for responsive visualisation and is never written back to raw data.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


OUTPUT_DIR = Path(__file__).resolve().parents[1] / "outputs"
FIGURES_DIR = OUTPUT_DIR / "figures"
BASIC_STATS_OUTPUT_PATH = OUTPUT_DIR / "shm_basic_stats.csv"
TARGET_STATS_OUTPUT_PATH = OUTPUT_DIR / "shm_target_stats.csv"
FEATURE_CORRELATIONS_OUTPUT_PATH = OUTPUT_DIR / "shm_basic_feature_correlations.csv"

MAX_PLOT_POINTS = 5_000


@dataclass(frozen=True)
class RepresentativeFile:
    role: str
    filename: str
    damage: float
    target_value: float


@dataclass(frozen=True)
class ShmDataPaths:
    data_root: Path
    train_dir: Path
    test_dir: Path
    labels_path: Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run read-only EDA for the SHM raw dataset."
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


def load_labels(labels_path: Path) -> pd.DataFrame:
    """Load train labels and enforce expected columns."""
    labels = pd.read_csv(labels_path)
    required_columns = {"filename", "damage"}
    missing_columns = required_columns - set(labels.columns)
    if missing_columns:
        raise ValueError(f"Missing required label columns: {sorted(missing_columns)}")
    return labels.sort_values("filename").reset_index(drop=True)


def load_signal(file_path: Path) -> np.ndarray:
    """Read one raw headerless stress signal as a numeric numpy array."""
    values = pd.read_csv(file_path, header=None).iloc[:, 0]
    return pd.to_numeric(values, errors="raise").to_numpy(dtype=float)


def calculate_target_stats(labels: pd.DataFrame) -> pd.Series:
    """Calculate requested descriptive statistics for the damage target."""
    damage = labels["damage"]
    return pd.Series(
        {
            "count": int(damage.count()),
            "minimum": float(damage.min()),
            "maximum": float(damage.max()),
            "mean": float(damage.mean()),
            "median": float(damage.median()),
            "standard_deviation": float(damage.std()),
            "percentile_25": float(damage.quantile(0.25)),
            "percentile_75": float(damage.quantile(0.75)),
        }
    )


def find_representative_files(labels: pd.DataFrame) -> list[RepresentativeFile]:
    """Select representative files by nearest target damage values."""
    damage = labels["damage"]
    targets = {
        "lowest_damage": float(damage.min()),
        "closest_to_25th_percentile": float(damage.quantile(0.25)),
        "closest_to_median": float(damage.median()),
        "closest_to_75th_percentile": float(damage.quantile(0.75)),
        "highest_damage": float(damage.max()),
    }

    representatives: list[RepresentativeFile] = []
    for role, target_value in targets.items():
        idx = (damage - target_value).abs().idxmin()
        row = labels.loc[idx]
        representatives.append(
            RepresentativeFile(
                role=role,
                filename=str(row["filename"]),
                damage=float(row["damage"]),
                target_value=target_value,
            )
        )
    return representatives


def downsample_for_plot(values: np.ndarray, max_points: int = MAX_PLOT_POINTS) -> tuple[np.ndarray, np.ndarray]:
    """Return sample indices and values for visualisation-only plotting."""
    if len(values) <= max_points:
        indices = np.arange(len(values))
    else:
        indices = np.linspace(0, len(values) - 1, num=max_points, dtype=int)
    return indices, values[indices]


def save_damage_plots(labels: pd.DataFrame) -> list[Path]:
    """Save target distribution plots."""
    FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    output_paths: list[Path] = []

    fig, ax = plt.subplots(figsize=(9, 5))
    ax.hist(labels["damage"], bins=16, color="#3b82f6", edgecolor="white")
    ax.set_title("SHM Damage Distribution")
    ax.set_xlabel("Damage")
    ax.set_ylabel("Training file count")
    output_path = FIGURES_DIR / "damage_histogram.png"
    fig.tight_layout()
    fig.savefig(output_path, dpi=160)
    plt.close(fig)
    output_paths.append(output_path)

    fig, ax = plt.subplots(figsize=(6, 5))
    ax.boxplot(labels["damage"], vert=True)
    ax.set_title("SHM Damage Boxplot")
    ax.set_ylabel("Damage")
    output_path = FIGURES_DIR / "damage_boxplot.png"
    fig.tight_layout()
    fig.savefig(output_path, dpi=160)
    plt.close(fig)
    output_paths.append(output_path)

    sorted_labels = labels.sort_values("damage").reset_index(drop=True)
    fig, ax = plt.subplots(figsize=(12, 5))
    ax.plot(sorted_labels.index + 1, sorted_labels["damage"], marker="o", linewidth=1.5)
    ax.set_title("SHM Damage Values Sorted by Training File")
    ax.set_xlabel("Training file rank by damage")
    ax.set_ylabel("Damage")
    output_path = FIGURES_DIR / "damage_sorted_by_training_file.png"
    fig.tight_layout()
    fig.savefig(output_path, dpi=160)
    plt.close(fig)
    output_paths.append(output_path)

    return output_paths


def save_representative_signal_plots(
    representatives: list[RepresentativeFile],
    train_dir: Path,
) -> list[Path]:
    """Save per-representative signal plots using visualisation-only downsampling."""
    output_paths: list[Path] = []

    for representative in representatives:
        signal = load_signal(train_dir / representative.filename)
        indices, sampled_signal = downsample_for_plot(signal)

        fig, axes = plt.subplots(3, 1, figsize=(13, 10))
        fig.suptitle(
            f"{representative.role}: {representative.filename} "
            f"(damage={representative.damage:.6f})"
        )

        axes[0].plot(indices, sampled_signal, linewidth=0.8)
        axes[0].set_title("Stress vs Sample Index (visualisation-only downsampled)")
        axes[0].set_xlabel("Sample index")
        axes[0].set_ylabel("Stress")

        axes[1].hist(signal, bins=80, color="#10b981", edgecolor="white")
        axes[1].set_title("Stress Value Distribution (full raw signal)")
        axes[1].set_xlabel("Stress")
        axes[1].set_ylabel("Count")

        axes[2].plot(indices, np.abs(sampled_signal), color="#ef4444", linewidth=0.8)
        axes[2].set_title("Absolute Stress vs Sample Index (visualisation-only downsampled)")
        axes[2].set_xlabel("Sample index")
        axes[2].set_ylabel("Absolute stress")

        output_path = FIGURES_DIR / f"representative_{representative.role}_{representative.filename}.png"
        fig.tight_layout()
        fig.savefig(output_path, dpi=160)
        plt.close(fig)
        output_paths.append(output_path)

    return output_paths


def save_representative_comparison_plot(
    representatives: list[RepresentativeFile],
    train_dir: Path,
) -> Path:
    """Save one comparison plot for low, median, and high representative files."""
    roles_to_plot = {"lowest_damage", "closest_to_median", "highest_damage"}
    selected = [rep for rep in representatives if rep.role in roles_to_plot]

    fig, ax = plt.subplots(figsize=(13, 6))
    for representative in selected:
        signal = load_signal(train_dir / representative.filename)
        indices, sampled_signal = downsample_for_plot(signal)
        ax.plot(
            indices,
            sampled_signal,
            linewidth=0.8,
            alpha=0.85,
            label=f"{representative.role}: {representative.filename} "
            f"(damage={representative.damage:.6f})",
        )

    ax.set_title("Representative SHM Signals (visualisation-only downsampled)")
    ax.set_xlabel("Sample index")
    ax.set_ylabel("Stress")
    ax.legend()

    output_path = FIGURES_DIR / "representative_low_median_high_comparison.png"
    fig.tight_layout()
    fig.savefig(output_path, dpi=160)
    plt.close(fig)
    return output_path


def calculate_signal_stats(file_path: Path) -> dict[str, float | str]:
    """Calculate basic descriptive statistics from the full raw signal."""
    signal = load_signal(file_path)
    return {
        "filename": file_path.name,
        "mean": float(np.mean(signal)),
        "median": float(np.median(signal)),
        "standard_deviation": float(np.std(signal)),
        "variance": float(np.var(signal)),
        "minimum": float(np.min(signal)),
        "maximum": float(np.max(signal)),
        "peak_to_peak": float(np.ptp(signal)),
        "rms": float(np.sqrt(np.mean(signal**2))),
        "mean_absolute_value": float(np.mean(np.abs(signal))),
        "maximum_absolute_value": float(np.max(np.abs(signal))),
        "skewness": float(pd.Series(signal).skew()),
        "kurtosis": float(pd.Series(signal).kurt()),
    }


def build_basic_stats(labels: pd.DataFrame, train_dir: Path) -> pd.DataFrame:
    """Build one full-signal statistics row per training file and join labels."""
    records = [
        calculate_signal_stats(train_dir / filename)
        for filename in labels["filename"].tolist()
    ]
    stats = pd.DataFrame(records)
    return stats.merge(labels, on="filename", validate="one_to_one")


def save_scatter_plots(stats: pd.DataFrame) -> list[Path]:
    """Save scatter plots of true damage against selected full-signal statistics."""
    scatter_specs = {
        "rms": "RMS",
        "standard_deviation": "Standard Deviation",
        "maximum_absolute_value": "Max Absolute Stress",
        "peak_to_peak": "Peak-to-Peak",
        "kurtosis": "Kurtosis",
    }
    output_paths: list[Path] = []

    for column, label in scatter_specs.items():
        fig, ax = plt.subplots(figsize=(7, 5))
        ax.scatter(stats[column], stats["damage"], color="#6366f1", alpha=0.85)
        ax.set_title(f"True Damage vs {label}")
        ax.set_xlabel(label)
        ax.set_ylabel("True damage")
        output_path = FIGURES_DIR / f"damage_vs_{column}.png"
        fig.tight_layout()
        fig.savefig(output_path, dpi=160)
        plt.close(fig)
        output_paths.append(output_path)

    return output_paths


def calculate_basic_feature_correlations(stats: pd.DataFrame) -> pd.DataFrame:
    """Calculate feature-to-damage Pearson and Spearman correlations."""
    numeric_stats = stats.select_dtypes(include=[np.number])
    feature_columns = [column for column in numeric_stats.columns if column != "damage"]

    records = []
    for feature in feature_columns:
        pearson = numeric_stats[feature].corr(numeric_stats["damage"], method="pearson")
        spearman = numeric_stats[feature].corr(numeric_stats["damage"], method="spearman")
        records.append(
            {
                "feature": feature,
                "pearson_correlation": pearson,
                "absolute_pearson_correlation": abs(pearson),
                "spearman_correlation": spearman,
                "absolute_spearman_correlation": abs(spearman),
            }
        )

    return (
        pd.DataFrame(records)
        .sort_values(
            by=["absolute_spearman_correlation", "absolute_pearson_correlation"],
            ascending=[False, False],
        )
        .reset_index(drop=True)
    )


def save_basic_feature_correlations(stats: pd.DataFrame) -> pd.DataFrame:
    """Save correlations calculated from the derived basic stats table."""
    correlations = calculate_basic_feature_correlations(stats)
    correlations.to_csv(FEATURE_CORRELATIONS_OUTPUT_PATH, index=False)
    return correlations


def print_top_correlations(correlations: pd.DataFrame, top_n: int = 10) -> None:
    """Print the strongest absolute Spearman correlations."""
    print(f"\nTop {top_n} features by absolute Spearman correlation:")
    for _, row in correlations.head(top_n).iterrows():
        print(
            f"  {row['feature']}: "
            f"spearman={row['spearman_correlation']:.6f}, "
            f"pearson={row['pearson_correlation']:.6f}"
        )


def print_summary(
    target_stats: pd.Series,
    representatives: list[RepresentativeFile],
    output_paths: list[Path],
    correlations: pd.DataFrame | None = None,
) -> None:
    """Print requested terminal summary."""
    print("SHM EDA summary")
    print("===============")
    print("Target statistics:")
    for name, value in target_stats.items():
        print(f"  {name}: {value}")

    print("\nRepresentative files:")
    for representative in representatives:
        print(
            f"  {representative.role}: {representative.filename} "
            f"damage={representative.damage:.9f}"
        )

    print("\nGenerated outputs:")
    for output_path in output_paths:
        print(f"  {output_path}")

    if correlations is not None:
        print_top_correlations(correlations)


def main() -> None:
    args = parse_args()
    paths = validate_data_root(args.data_root)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    FIGURES_DIR.mkdir(parents=True, exist_ok=True)

    labels = load_labels(paths.labels_path)
    target_stats = calculate_target_stats(labels)
    target_stats.to_frame(name="value").to_csv(TARGET_STATS_OUTPUT_PATH)

    representatives = find_representative_files(labels)
    output_paths = []
    output_paths.append(TARGET_STATS_OUTPUT_PATH)
    output_paths.extend(save_damage_plots(labels))
    output_paths.extend(save_representative_signal_plots(representatives, paths.train_dir))
    output_paths.append(
        save_representative_comparison_plot(representatives, paths.train_dir)
    )

    basic_stats = build_basic_stats(labels, paths.train_dir)
    basic_stats.to_csv(BASIC_STATS_OUTPUT_PATH, index=False)
    output_paths.append(BASIC_STATS_OUTPUT_PATH)
    output_paths.extend(save_scatter_plots(basic_stats))

    correlations = save_basic_feature_correlations(basic_stats)
    output_paths.append(FEATURE_CORRELATIONS_OUTPUT_PATH)

    print_summary(target_stats, representatives, output_paths, correlations)


if __name__ == "__main__":
    main()
