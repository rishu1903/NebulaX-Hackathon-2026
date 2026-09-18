"""Leakage-safe baseline modelling for SHM engineered features.

This script uses only PS3/SHM_Work/outputs/shm_features.csv. It does not read
official Test files, alter raw data, or use filenames as model features.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.cross_decomposition import PLSRegression
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import (
    ExtraTreesRegressor,
    GradientBoostingRegressor,
    RandomForestRegressor,
)
from sklearn.linear_model import ElasticNet, LinearRegression, Ridge
from sklearn.model_selection import RepeatedKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.compose import TransformedTargetRegressor


WORK_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = WORK_ROOT / "outputs"
FEATURES_PATH = OUTPUT_DIR / "shm_features.csv"
MODELING_DIR = OUTPUT_DIR / "modeling"
FIGURES_DIR = MODELING_DIR / "figures"

RESULTS_PATH = MODELING_DIR / "shm_cv_model_results.csv"
OOF_PATH = MODELING_DIR / "shm_oof_predictions.csv"
K_VALUES_PATH = MODELING_DIR / "physics_k_values.csv"

RANDOM_STATE = 42
N_SPLITS = 5
N_REPEATS = 20
EXPECTED_OBSERVATIONS = 64
EPSILON = 1e-12


@dataclass(frozen=True)
class ModelConfig:
    model: str
    feature_set: str
    target_transform: str
    feature_columns: list[str]
    evaluator: str
    estimator_factory: Callable[[], object] | None = None

    @property
    def label(self) -> str:
        return f"{self.model} | {self.feature_set} | {self.target_transform}"


def load_feature_table(features_path: Path = FEATURES_PATH) -> pd.DataFrame:
    """Load and validate the engineered SHM feature table."""
    df = pd.read_csv(features_path)
    if len(df) != EXPECTED_OBSERVATIONS:
        raise ValueError(f"Expected {EXPECTED_OBSERVATIONS} observations, got {len(df)}")
    if "filename" not in df.columns or "damage" not in df.columns:
        raise ValueError("Feature table must contain filename and damage columns")
    if df["filename"].duplicated().any():
        duplicates = df.loc[df["filename"].duplicated(), "filename"].tolist()
        raise ValueError(f"Duplicate filenames found: {duplicates}")
    if not np.all(np.isfinite(df.select_dtypes(include=[np.number]).to_numpy())):
        raise ValueError("Feature table contains NaN or infinity")
    if (df["damage"] <= 0).any():
        bad_files = df.loc[df["damage"] <= 0, "filename"].tolist()
        raise ValueError(f"All damage values must be > 0. Invalid files: {bad_files}")

    forbidden_columns = [
        column
        for column in df.columns
        if column != "filename" and ("file" in column.lower() or "number" in column.lower())
    ]
    if forbidden_columns:
        raise ValueError(f"Potential filename-derived columns are forbidden: {forbidden_columns}")

    return df.sort_values("filename").reset_index(drop=True)


def engineered_feature_columns(df: pd.DataFrame) -> list[str]:
    return [column for column in df.columns if column not in {"filename", "damage"}]


def build_feature_sets(feature_columns: list[str]) -> dict[str, list[str]]:
    fatigue_keywords = (
        "rainflow",
        "range_",
        "weighted_range",
        "fatigue_power",
        "large_cycle",
    )
    fatigue = [
        column
        for column in feature_columns
        if any(keyword in column for keyword in fatigue_keywords)
    ]
    basic = [column for column in feature_columns if column not in fatigue]
    return {
        "BASIC": basic,
        "FATIGUE": fatigue,
        "ALL": feature_columns,
    }


def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.mean(np.abs(y_true - y_pred) / np.abs(y_true)))


def metric_row(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    errors = y_true - y_pred
    abs_pct_error = np.abs(errors) / np.abs(y_true)
    ss_res = float(np.sum(errors**2))
    ss_tot = float(np.sum((y_true - np.mean(y_true)) ** 2))
    r2 = float(1.0 - ss_res / ss_tot) if ss_tot > 0 else np.nan
    fold_mape = float(np.mean(abs_pct_error))
    return {
        "mape": fold_mape,
        "competition_score": float(max(0.0, 1.0 - fold_mape)),
        "mae": float(np.mean(np.abs(errors))),
        "rmse": float(np.sqrt(np.mean(errors**2))),
        "r2": r2,
        "median_absolute_percentage_error": float(np.median(abs_pct_error)),
    }


def summarize_fold_metrics(
    config: ModelConfig,
    fold_metrics: list[dict[str, float]],
) -> dict[str, float | str]:
    fold_df = pd.DataFrame(fold_metrics)
    return {
        "model": config.model,
        "feature_set": config.feature_set,
        "target_transform": config.target_transform,
        "mean_mape": float(fold_df["mape"].mean()),
        "median_mape": float(fold_df["mape"].median()),
        "std_mape": float(fold_df["mape"].std(ddof=0)),
        "q25_mape": float(fold_df["mape"].quantile(0.25)),
        "q75_mape": float(fold_df["mape"].quantile(0.75)),
        "mean_competition_score": float(fold_df["competition_score"].mean()),
        "mean_mae": float(fold_df["mae"].mean()),
        "mean_rmse": float(fold_df["rmse"].mean()),
        "mean_r2": float(fold_df["r2"].mean()),
    }


def make_log_target_regressor(estimator: object) -> TransformedTargetRegressor:
    return TransformedTargetRegressor(
        regressor=estimator,
        func=np.log,
        inverse_func=np.exp,
        check_inverse=False,
    )


def build_model_configs(feature_sets: dict[str, list[str]], df: pd.DataFrame) -> list[ModelConfig]:
    configs: list[ModelConfig] = [
        ModelConfig(
            model="DummyRegressor_median",
            feature_set="ALL",
            target_transform="direct",
            feature_columns=feature_sets["ALL"],
            evaluator="sklearn",
            estimator_factory=lambda: DummyRegressor(strategy="median"),
        ),
        ModelConfig(
            model="LinearRegression_peak_to_peak",
            feature_set="SINGLE_peak_to_peak",
            target_transform="direct",
            feature_columns=["peak_to_peak"],
            evaluator="sklearn",
            estimator_factory=LinearRegression,
        ),
        ModelConfig(
            model="LinearRegression_maximum_absolute_value",
            feature_set="SINGLE_maximum_absolute_value",
            target_transform="direct",
            feature_columns=["maximum_absolute_value"],
            evaluator="sklearn",
            estimator_factory=LinearRegression,
        ),
        ModelConfig(
            model="LinearRegression_fatigue_power_5",
            feature_set="SINGLE_fatigue_power_5",
            target_transform="direct",
            feature_columns=["fatigue_power_5"],
            evaluator="sklearn",
            estimator_factory=LinearRegression,
        ),
        ModelConfig(
            model="Physics_k_times_fatigue_power_5",
            feature_set="SINGLE_fatigue_power_5",
            target_transform="direct",
            feature_columns=["fatigue_power_5"],
            evaluator="physics_k",
        ),
        ModelConfig(
            model="PowerLaw_peak_to_peak",
            feature_set="SINGLE_peak_to_peak",
            target_transform="log_log",
            feature_columns=["peak_to_peak"],
            evaluator="power_law",
        ),
    ]

    if (df["fatigue_power_5"] > 0).all():
        configs.append(
            ModelConfig(
                model="PowerLaw_fatigue_power_5",
                feature_set="SINGLE_fatigue_power_5",
                target_transform="log_log",
                feature_columns=["fatigue_power_5"],
                evaluator="power_law",
            )
        )

    for feature_set_name, columns in feature_sets.items():
        configs.extend(
            [
                ModelConfig(
                    model="Ridge",
                    feature_set=feature_set_name,
                    target_transform="direct",
                    feature_columns=columns,
                    evaluator="sklearn",
                    estimator_factory=lambda: make_pipeline(StandardScaler(), Ridge(alpha=1.0)),
                ),
                ModelConfig(
                    model="Ridge",
                    feature_set=feature_set_name,
                    target_transform="log",
                    feature_columns=columns,
                    evaluator="sklearn",
                    estimator_factory=lambda: make_log_target_regressor(
                        make_pipeline(StandardScaler(), Ridge(alpha=1.0))
                    ),
                ),
                ModelConfig(
                    model="ElasticNet",
                    feature_set=feature_set_name,
                    target_transform="direct",
                    feature_columns=columns,
                    evaluator="sklearn",
                    estimator_factory=lambda: make_pipeline(
                        StandardScaler(),
                        ElasticNet(
                            alpha=0.01,
                            l1_ratio=0.2,
                            max_iter=100_000,
                            random_state=RANDOM_STATE,
                        ),
                    ),
                ),
                ModelConfig(
                    model="ElasticNet",
                    feature_set=feature_set_name,
                    target_transform="log",
                    feature_columns=columns,
                    evaluator="sklearn",
                    estimator_factory=lambda: make_log_target_regressor(
                        make_pipeline(
                            StandardScaler(),
                            ElasticNet(
                                alpha=0.01,
                                l1_ratio=0.2,
                                max_iter=100_000,
                                random_state=RANDOM_STATE,
                            ),
                        )
                    ),
                ),
                ModelConfig(
                    model="RandomForestRegressor",
                    feature_set=feature_set_name,
                    target_transform="direct",
                    feature_columns=columns,
                    evaluator="sklearn",
                    estimator_factory=lambda: RandomForestRegressor(
                        n_estimators=300,
                        max_depth=3,
                        min_samples_leaf=4,
                        random_state=RANDOM_STATE,
                        n_jobs=-1,
                    ),
                ),
                ModelConfig(
                    model="ExtraTreesRegressor",
                    feature_set=feature_set_name,
                    target_transform="direct",
                    feature_columns=columns,
                    evaluator="sklearn",
                    estimator_factory=lambda: ExtraTreesRegressor(
                        n_estimators=300,
                        max_depth=3,
                        min_samples_leaf=4,
                        random_state=RANDOM_STATE,
                        n_jobs=-1,
                    ),
                ),
                ModelConfig(
                    model="GradientBoostingRegressor",
                    feature_set=feature_set_name,
                    target_transform="direct",
                    feature_columns=columns,
                    evaluator="sklearn",
                    estimator_factory=lambda: GradientBoostingRegressor(
                        n_estimators=80,
                        learning_rate=0.04,
                        max_depth=2,
                        min_samples_leaf=4,
                        random_state=RANDOM_STATE,
                    ),
                ),
            ]
        )

        max_components = min(5, len(columns), EXPECTED_OBSERVATIONS - EXPECTED_OBSERVATIONS // N_SPLITS)
        for components in (2, 3, 5):
            if components <= max_components:
                configs.append(
                    ModelConfig(
                        model=f"PLSRegression_{components}_components",
                        feature_set=feature_set_name,
                        target_transform="direct",
                        feature_columns=columns,
                        evaluator="sklearn",
                        estimator_factory=lambda components=components: make_pipeline(
                            StandardScaler(),
                            PLSRegression(n_components=components, scale=False),
                        ),
                    )
                )

    return configs


def predict_sklearn_model(
    config: ModelConfig,
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    x_valid: pd.DataFrame,
) -> np.ndarray:
    if config.estimator_factory is None:
        raise ValueError(f"No estimator factory configured for {config.label}")
    estimator = clone(config.estimator_factory())
    estimator.fit(x_train, y_train)
    return np.asarray(estimator.predict(x_valid), dtype=float).reshape(-1)


def predict_physics_k(
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    x_valid: pd.DataFrame,
) -> tuple[np.ndarray, float]:
    x_train_values = x_train["fatigue_power_5"].to_numpy(dtype=float)
    denominator = float(np.sum(x_train_values**2))
    if denominator <= 0:
        raise ValueError("Cannot fit physics coefficient: zero denominator")
    k = float(np.sum(x_train_values * y_train) / denominator)
    y_pred = k * x_valid["fatigue_power_5"].to_numpy(dtype=float)
    return y_pred, k


def predict_power_law(
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    x_valid: pd.DataFrame,
) -> np.ndarray:
    feature = x_train.columns[0]
    if (x_train[feature] <= 0).any() or (x_valid[feature] <= 0).any():
        raise ValueError(f"Power-law feature must be positive: {feature}")
    estimator = LinearRegression()
    estimator.fit(np.log(x_train[[feature]]), np.log(y_train))
    return np.exp(estimator.predict(np.log(x_valid[[feature]])))


def evaluate_config(
    config: ModelConfig,
    df: pd.DataFrame,
    folds: list[tuple[np.ndarray, np.ndarray]],
) -> tuple[dict[str, float | str], pd.DataFrame, list[dict[str, float | str]]]:
    y = df["damage"].to_numpy(dtype=float)
    x_all = df[config.feature_columns]
    fold_metrics: list[dict[str, float]] = []
    predictions: list[dict[str, float | str]] = []
    k_records: list[dict[str, float | str]] = []

    for fold_index, (train_idx, valid_idx) in enumerate(folds, start=1):
        x_train = x_all.iloc[train_idx]
        y_train = y[train_idx]
        x_valid = x_all.iloc[valid_idx]
        y_valid = y[valid_idx]

        if config.evaluator == "sklearn":
            y_pred = predict_sklearn_model(config, x_train, y_train, x_valid)
        elif config.evaluator == "physics_k":
            y_pred, k = predict_physics_k(x_train, y_train, x_valid)
            k_records.append(
                {
                    "model": config.model,
                    "feature_set": config.feature_set,
                    "target_transform": config.target_transform,
                    "fold": fold_index,
                    "k": k,
                }
            )
        elif config.evaluator == "power_law":
            y_pred = predict_power_law(x_train, y_train, x_valid)
        else:
            raise ValueError(f"Unknown evaluator: {config.evaluator}")

        fold_metrics.append(metric_row(y_valid, y_pred))
        for filename, true_value, pred_value in zip(
            df.iloc[valid_idx]["filename"],
            y_valid,
            y_pred,
        ):
            predictions.append(
                {
                    "filename": filename,
                    "true_damage": true_value,
                    "predicted_damage": pred_value,
                    "absolute_percentage_error": abs(true_value - pred_value)
                    / abs(true_value),
                    "model": config.label,
                    "fold": fold_index,
                }
            )

    return summarize_fold_metrics(config, fold_metrics), pd.DataFrame(predictions), k_records


def aggregate_oof_predictions(predictions: pd.DataFrame) -> pd.DataFrame:
    """Average repeated-CV validation predictions per filename and model."""
    grouped = (
        predictions.groupby(["model", "filename", "true_damage"], as_index=False)
        .agg(predicted_damage=("predicted_damage", "mean"))
        .sort_values(["model", "filename"])
        .reset_index(drop=True)
    )
    grouped["absolute_percentage_error"] = (
        (grouped["true_damage"] - grouped["predicted_damage"]).abs()
        / grouped["true_damage"].abs()
    )
    return grouped[[
        "filename",
        "true_damage",
        "predicted_damage",
        "absolute_percentage_error",
        "model",
    ]]


def select_oof_models(results: pd.DataFrame) -> list[str]:
    simple_masks = [
        results["model"].str.startswith("LinearRegression_"),
        results["model"].str.startswith("PowerLaw_"),
        results["model"].eq("Physics_k_times_fatigue_power_5"),
    ]
    selected_models = []
    for mask in simple_masks:
        subset = results.loc[mask].sort_values("mean_mape")
        if not subset.empty:
            row = subset.iloc[0]
            selected_models.append(
                f"{row['model']} | {row['feature_set']} | {row['target_transform']}"
            )
    return sorted(set(selected_models))


def save_model_comparison_plot(results: pd.DataFrame) -> Path:
    top = results.head(15).sort_values("mean_mape", ascending=True)
    labels = top["model"] + "\n" + top["feature_set"] + "\n" + top["target_transform"]
    fig, ax = plt.subplots(figsize=(12, 8))
    ax.barh(labels, top["mean_mape"], color="#3b82f6")
    ax.set_xlabel("Mean CV MAPE")
    ax.set_title("SHM Model Comparison by Mean Repeated-CV MAPE")
    fig.tight_layout()
    output_path = FIGURES_DIR / "model_comparison_mean_mape.png"
    fig.savefig(output_path, dpi=160)
    plt.close(fig)
    return output_path


def save_predicted_vs_actual_plot(oof: pd.DataFrame, model_names: list[str]) -> Path:
    plot_df = oof[oof["model"].isin(model_names)]
    fig, axes = plt.subplots(1, len(model_names), figsize=(6 * len(model_names), 5))
    if len(model_names) == 1:
        axes = [axes]
    for ax, model_name in zip(axes, model_names):
        model_df = plot_df[plot_df["model"] == model_name]
        ax.scatter(model_df["true_damage"], model_df["predicted_damage"], alpha=0.85)
        low = min(model_df["true_damage"].min(), model_df["predicted_damage"].min())
        high = max(model_df["true_damage"].max(), model_df["predicted_damage"].max())
        ax.plot([low, high], [low, high], color="#ef4444", linewidth=1)
        ax.set_title(model_name)
        ax.set_xlabel("True damage")
        ax.set_ylabel("Predicted damage")
    fig.tight_layout()
    output_path = FIGURES_DIR / "predicted_vs_actual_strongest_models.png"
    fig.savefig(output_path, dpi=160)
    plt.close(fig)
    return output_path


def save_percentage_error_plot(oof: pd.DataFrame, model_names: list[str]) -> Path:
    plot_df = oof[oof["model"].isin(model_names)]
    fig, ax = plt.subplots(figsize=(9, 6))
    for model_name in model_names:
        model_df = plot_df[plot_df["model"] == model_name]
        ax.scatter(
            model_df["true_damage"],
            model_df["absolute_percentage_error"],
            alpha=0.75,
            label=model_name,
        )
    ax.set_title("Percentage Error vs True Damage")
    ax.set_xlabel("True damage")
    ax.set_ylabel("Absolute percentage error")
    ax.legend(fontsize=8)
    fig.tight_layout()
    output_path = FIGURES_DIR / "percentage_error_vs_true_damage.png"
    fig.savefig(output_path, dpi=160)
    plt.close(fig)
    return output_path


def save_fatigue_power_plot(df: pd.DataFrame) -> Path:
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.scatter(df["fatigue_power_5"], df["damage"], alpha=0.85, color="#10b981")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_title("fatigue_power_5 vs Damage")
    ax.set_xlabel("fatigue_power_5")
    ax.set_ylabel("damage")
    fig.tight_layout()
    output_path = FIGURES_DIR / "fatigue_power_5_vs_damage.png"
    fig.savefig(output_path, dpi=160)
    plt.close(fig)
    return output_path


def save_physics_prediction_plot(oof: pd.DataFrame) -> Path:
    model_name = "Physics_k_times_fatigue_power_5 | SINGLE_fatigue_power_5 | direct"
    model_df = oof[oof["model"] == model_name]
    fig, ax = plt.subplots(figsize=(7, 6))
    ax.scatter(model_df["true_damage"], model_df["predicted_damage"], alpha=0.85)
    low = min(model_df["true_damage"].min(), model_df["predicted_damage"].min())
    high = max(model_df["true_damage"].max(), model_df["predicted_damage"].max())
    ax.plot([low, high], [low, high], color="#ef4444", linewidth=1)
    ax.set_title("Physics-Informed Model: Predicted vs Actual")
    ax.set_xlabel("True damage")
    ax.set_ylabel("Predicted damage")
    fig.tight_layout()
    output_path = FIGURES_DIR / "physics_predicted_vs_actual.png"
    fig.savefig(output_path, dpi=160)
    plt.close(fig)
    return output_path


def save_k_distribution_plot(k_values: pd.DataFrame) -> Path:
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.hist(k_values["k"], bins=20, color="#6366f1", edgecolor="white")
    ax.set_title("Distribution of Fold-Fitted Physics Coefficient k")
    ax.set_xlabel("k")
    ax.set_ylabel("Fold count")
    fig.tight_layout()
    output_path = FIGURES_DIR / "physics_k_distribution.png"
    fig.savefig(output_path, dpi=160)
    plt.close(fig)
    return output_path


def print_summary(
    df: pd.DataFrame,
    feature_sets: dict[str, list[str]],
    results: pd.DataFrame,
) -> None:
    feature_count = len(engineered_feature_columns(df))
    print("SHM baseline modelling summary")
    print("==============================")
    print(f"Observations: {len(df)}")
    print(f"Engineered features: {feature_count}")
    print("Feature-set sizes:")
    for name, columns in feature_sets.items():
        print(f"  {name}: {len(columns)}")

    print("\nTop 10 model configurations by mean CV MAPE:")
    for _, row in results.head(10).iterrows():
        print(
            f"  {row['model']} | {row['feature_set']} | {row['target_transform']}: "
            f"mean_mape={row['mean_mape']:.6f}, "
            f"mean_score={row['mean_competition_score']:.6f}"
        )

    def print_named_result(name: str) -> None:
        row = results[results["model"].eq(name)].sort_values("mean_mape").iloc[0]
        print(
            f"{name}: mean_mape={row['mean_mape']:.6f}, "
            f"mean_score={row['mean_competition_score']:.6f}"
        )

    print("\nRequested baseline checkpoints:")
    print_named_result("DummyRegressor_median")
    print_named_result("LinearRegression_peak_to_peak")
    print_named_result("LinearRegression_fatigue_power_5")
    print_named_result("Physics_k_times_fatigue_power_5")

    best = results.iloc[0]
    print("\nBest overall model:")
    print(
        f"  {best['model']} | {best['feature_set']} | {best['target_transform']} "
        f"mean_mape={best['mean_mape']:.6f}, "
        f"mean_competition_score={best['mean_competition_score']:.6f}"
    )
    print(f"\nResults CSV: {RESULTS_PATH}")
    print(f"OOF predictions CSV: {OOF_PATH}")
    print(f"Physics k CSV: {K_VALUES_PATH}")
    print(f"Figures: {FIGURES_DIR}")
    print(
        "\nOOF note: repeated-CV validation predictions for the same filename "
        "are aggregated by mean predicted_damage."
    )


def main() -> None:
    MODELING_DIR.mkdir(parents=True, exist_ok=True)
    FIGURES_DIR.mkdir(parents=True, exist_ok=True)

    df = load_feature_table()
    feature_columns = engineered_feature_columns(df)
    feature_sets = build_feature_sets(feature_columns)
    cv = RepeatedKFold(
        n_splits=N_SPLITS,
        n_repeats=N_REPEATS,
        random_state=RANDOM_STATE,
    )
    folds = list(cv.split(df))

    result_rows: list[dict[str, float | str]] = []
    all_predictions: list[pd.DataFrame] = []
    all_k_records: list[dict[str, float | str]] = []

    for config in build_model_configs(feature_sets, df):
        result_row, predictions, k_records = evaluate_config(config, df, folds)
        result_rows.append(result_row)
        all_predictions.append(predictions)
        all_k_records.extend(k_records)

    results = (
        pd.DataFrame(result_rows)
        .sort_values("mean_mape", ascending=True)
        .reset_index(drop=True)
    )
    results.to_csv(RESULTS_PATH, index=False)

    raw_oof = pd.concat(all_predictions, ignore_index=True)
    selected_oof_models = select_oof_models(results)
    aggregated_oof = aggregate_oof_predictions(
        raw_oof[raw_oof["model"].isin(selected_oof_models)]
    )
    aggregated_oof.to_csv(OOF_PATH, index=False)

    k_values = pd.DataFrame(all_k_records)
    k_values.to_csv(K_VALUES_PATH, index=False)

    figure_paths = [
        save_model_comparison_plot(results),
        save_predicted_vs_actual_plot(aggregated_oof, selected_oof_models),
        save_percentage_error_plot(aggregated_oof, selected_oof_models),
        save_fatigue_power_plot(df),
        save_physics_prediction_plot(aggregated_oof),
        save_k_distribution_plot(k_values),
    ]
    for path in figure_paths:
        print(f"Saved figure: {path}")

    print_summary(df, feature_sets, results)


if __name__ == "__main__":
    main()
