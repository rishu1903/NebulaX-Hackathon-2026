"""Reproduce the 43-feature Variant A training recipe from official rail data."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, f1_score
from sklearn.model_selection import StratifiedKFold

from features import extract_features
from model_def import EnsembleRailModel

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "02_Datasets" / "Rail_Corrugation"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "models" / "rail_corrugation_model.joblib"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    labels = pd.read_csv(DATA_DIR / "Train_Labels.csv")
    if len(labels) != 272 or labels["filename"].nunique() != 272:
        raise ValueError("Expected 272 unique labeled training files")
    rows = []
    for item in labels.itertuples(index=False):
        frame = pd.read_csv(DATA_DIR / "Train" / item.filename)
        features = extract_features(frame)
        features["filename"] = item.filename
        features["label"] = item.label
        rows.append(features)
    table = pd.DataFrame(rows)

    # The deployed artifact uses the original 43 features. The 10 localized
    # top-three research features are extracted but intentionally excluded.
    feature_cols = [
        name for name in table.columns
        if name not in ("filename", "label") and "top3" not in name
    ]
    if len(feature_cols) != 43:
        raise ValueError(f"Expected 43 baseline features; found {len(feature_cols)}")
    X = table[feature_cols].to_numpy()
    y = table["label"].to_numpy()
    low_transition = table["is_stationary"].to_numpy()

    folds = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    oof = np.empty(len(y), dtype=object)
    fold_scores = []
    for train_idx, val_idx in folds.split(X, y):
        model = EnsembleRailModel().fit(X[train_idx], y[train_idx])
        predictions = model.predict(X[val_idx], is_stationary=low_transition[val_idx])
        oof[val_idx] = predictions
        fold_scores.append(f1_score(y[val_idx], predictions, average="macro"))
    print("Fold macro F1:", [round(score, 4) for score in fold_scores])
    print("Mean fold macro F1:", round(float(np.mean(fold_scores)), 4))
    print(classification_report(y, oof, digits=4))

    final_model = EnsembleRailModel().fit(X, y)
    payload = {
        "model": final_model,
        "feature_cols": feature_cols,
        "classes": list(final_model.classes_),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(payload, args.output)
    print("Saved model to", args.output)


if __name__ == "__main__":
    main()
