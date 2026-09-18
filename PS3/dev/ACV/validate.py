"""Leave-one-file-out validation of the ACV core scorer, plus benchmark comparisons.

Since the core scorer has no trained parameters, "leave-one-file-out" here is a sanity
check (does the fixed formula still find the right car when we pretend not to know the
answer?) rather than classic cross-validation of a fitted model. The benchmarks
(windowed+trend, Isolation Forest) exist to see whether either widens the thin margins on
case_02/case_05, and to give an honest model-comparison story for the write-up — not
because the core method needs replacing.
"""
import os

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import LeaveOneGroupOut

import acv_core as core

HERE = os.path.dirname(os.path.abspath(__file__))
DATASET_DIR = os.path.join(HERE, "..", "..", "02_Datasets", "ACV")
TRAIN_DIR = os.path.join(DATASET_DIR, "Train")
TEST_DIR = os.path.join(DATASET_DIR, "Test")
LABELS_PATH = os.path.join(DATASET_DIR, "Train_Labels.csv")


def rank_decay_score(rank, n):
    if rank is None or n == 0:
        return 0.0
    return (n - (rank - 1)) / n


def load_labels():
    df = pd.read_csv(LABELS_PATH, dtype=str)
    return dict(zip(df["filename"], df["faulty_car"].str.strip()))


def rank_from_scores(scores, car_ids, true_car):
    ranked = core.rank_cars(scores, car_ids)
    n = len(ranked)
    rank = ranked.index(true_car) + 1 if true_car in ranked else None
    return ranked, rank, rank_decay_score(rank, n)


# --- core scorer ------------------------------------------------------------------

def evaluate_core(labels):
    rows = []
    for path in core.iter_case_files(TRAIN_DIR):
        fname = os.path.basename(path)
        if fname not in labels:
            continue
        true_car = labels[fname]
        result = core.predict_file(path)
        _, rank, score = rank_from_scores(result["scores"], result["ranked_cars"], true_car)
        rows.append(
            {
                "file": fname,
                "true_car": true_car,
                "n_cars": len(result["ranked_cars"]),
                "rank": rank,
                "score": score,
                "margin": result["margin"],
                "schema": result["schema_matched"],
                "empty_cars": ",".join(result["empty_cars"]) or "-",
            }
        )
    return pd.DataFrame(rows)


# --- benchmark: windowed mean + trend ----------------------------------------------

def windowed_trend_features(df, signals, usable_cars, window="1h"):
    """Per usable car: (mean deviation across windows, slope of deviation over windows)."""
    gap_df = core.cooling_gap_frame(df, signals, usable_cars)
    gap_df = gap_df.set_index(df["Time"])
    sibling_median = gap_df.median(axis=1)
    deviation = gap_df.sub(sibling_median, axis=0)

    windowed = deviation.resample(window).mean()
    mean_scores, trend_scores = {}, {}
    for c in usable_cars:
        series = windowed[c].dropna()
        mean_scores[c] = float(series.mean()) if len(series) > 0 else np.nan
        if len(series) >= 3:
            x = np.arange(len(series))
            trend_scores[c] = float(np.polyfit(x, series.to_numpy(), 1)[0])
        else:
            trend_scores[c] = np.nan
    return mean_scores, trend_scores


def zscore(d):
    vals = np.array([v for v in d.values() if pd.notna(v)])
    if len(vals) < 2 or vals.std() == 0:
        return {k: 0.0 for k in d}
    mu, sigma = vals.mean(), vals.std()
    return {k: (v - mu) / sigma if pd.notna(v) else 0.0 for k, v in d.items()}


def evaluate_windowed_trend(labels, trend_weight=0.5):
    rows = []
    for path in core.iter_case_files(TRAIN_DIR):
        fname = os.path.basename(path)
        if fname not in labels:
            continue
        true_car = labels[fname]
        df, car_ids = core.load_case(path)
        signals = core.resolve_signals(df, car_ids)
        usable_cars = [c for c in car_ids if c not in signals["empty_cars"]]

        mean_scores, trend_scores = windowed_trend_features(df, signals, usable_cars)
        mean_z, trend_z = zscore(mean_scores), zscore(trend_scores)
        combined = {c: mean_z[c] + trend_weight * trend_z[c] for c in usable_cars}
        for c in signals["empty_cars"]:
            combined[c] = np.nan

        ranked, rank, score = rank_from_scores(combined, car_ids, true_car)
        rows.append({"file": fname, "true_car": true_car, "rank": rank, "score": score})
    return pd.DataFrame(rows)


# --- benchmark: Isolation Forest ----------------------------------------------------

def evaluate_isolation_forest(labels):
    rows = []
    for path in core.iter_case_files(TRAIN_DIR):
        fname = os.path.basename(path)
        if fname not in labels:
            continue
        true_car = labels[fname]
        df, car_ids = core.load_case(path)
        signals = core.resolve_signals(df, car_ids)
        usable_cars = [c for c in car_ids if c not in signals["empty_cars"]]

        if len(usable_cars) < 3:
            rows.append({"file": fname, "true_car": true_car, "rank": None, "score": 0.0})
            continue

        mean_scores, trend_scores = windowed_trend_features(df, signals, usable_cars)
        X = np.array(
            [[mean_scores[c] if pd.notna(mean_scores[c]) else 0.0,
              trend_scores[c] if pd.notna(trend_scores[c]) else 0.0] for c in usable_cars]
        )
        model = IsolationForest(n_estimators=200, random_state=42, contamination="auto")
        model.fit(X)
        anomaly = -model.score_samples(X)  # higher = more anomalous

        scores = {c: float(s) for c, s in zip(usable_cars, anomaly)}
        for c in signals["empty_cars"]:
            scores[c] = np.nan

        ranked, rank, score = rank_from_scores(scores, car_ids, true_car)
        rows.append({"file": fname, "true_car": true_car, "rank": rank, "score": score})
    return pd.DataFrame(rows)


# --- benchmark: Logistic Regression (genuine supervised learning, leave-one-file-out) ---
#
# Trained on the 48 (car, file) instances the 6 labelled files actually give us — 6
# positive (faulty), ~38-42 negative (normal, depending on how many cars have usable
# data per file). class_weight="balanced" instead of SMOTE (see conversation: SMOTE
# would interpolate between too few real positives to mean anything). Evaluated with
# LeaveOneGroupOut, group=file, so no fold ever trains and tests on the same file's
# cars — the leakage guard that actually matters here (Section 3.2).

def build_car_feature_table(labels):
    rows = []
    for path in core.iter_case_files(TRAIN_DIR):
        fname = os.path.basename(path)
        if fname not in labels:
            continue
        true_car = labels[fname]
        df, car_ids = core.load_case(path)
        signals = core.resolve_signals(df, car_ids)
        usable_cars = [c for c in car_ids if c not in signals["empty_cars"]]
        mean_scores, trend_scores = windowed_trend_features(df, signals, usable_cars)
        for c in usable_cars:
            rows.append(
                {
                    "file": fname,
                    "car": c,
                    "mean_dev": mean_scores[c] if pd.notna(mean_scores[c]) else 0.0,
                    "trend": trend_scores[c] if pd.notna(trend_scores[c]) else 0.0,
                    "is_faulty": int(c == true_car),
                }
            )
    return pd.DataFrame(rows)


def evaluate_logistic_regression(labels):
    table = build_car_feature_table(labels)
    X = table[["mean_dev", "trend"]].to_numpy()
    y = table["is_faulty"].to_numpy()
    groups = table["file"].to_numpy()

    rows = []
    logo = LeaveOneGroupOut()
    for train_idx, test_idx in logo.split(X, y, groups):
        test_file = table.iloc[test_idx]["file"].iloc[0]
        true_car = labels[test_file]

        model = LogisticRegression(C=0.5, class_weight="balanced", max_iter=1000)
        model.fit(X[train_idx], y[train_idx])
        proba = model.predict_proba(X[test_idx])[:, 1]

        test_rows = table.iloc[test_idx].reset_index(drop=True)
        scores = {row["car"]: float(p) for row, p in zip(test_rows.to_dict("records"), proba)}

        df, car_ids = core.load_case(os.path.join(TRAIN_DIR, test_file))
        signals = core.resolve_signals(df, car_ids)
        for c in signals["empty_cars"]:
            scores[c] = np.nan

        ranked, rank, score = rank_from_scores(scores, car_ids, true_car)
        rows.append({"file": test_file, "true_car": true_car, "rank": rank, "score": score})
    return pd.DataFrame(rows).sort_values("file").reset_index(drop=True)


# --- calibration: normal-instance score distribution (for the future UI's colour cuts) --

def normal_instance_scores(labels):
    normal_scores = []
    for path in core.iter_case_files(TRAIN_DIR):
        fname = os.path.basename(path)
        if fname not in labels:
            continue
        true_car = labels[fname]
        result = core.predict_file(path)
        for car, s in result["scores"].items():
            if car != true_car and pd.notna(s):
                normal_scores.append(s)
    return np.array(normal_scores)


# --- main ----------------------------------------------------------------------------

def main():
    labels = load_labels()

    print("=" * 70)
    print("CORE SCORER — leave-one-file-out (per-file formula, not fitted)")
    print("=" * 70)
    core_df = evaluate_core(labels)
    print(core_df.to_string(index=False))
    print(f"\nMean rank-decay score: {core_df['score'].mean():.3f}")

    print("\n" + "=" * 70)
    print("BENCHMARK: windowed mean + trend-over-time (z-score combined)")
    print("=" * 70)
    wt_df = evaluate_windowed_trend(labels)
    print(wt_df.to_string(index=False))
    print(f"\nMean rank-decay score: {wt_df['score'].mean():.3f}")

    print("\n" + "=" * 70)
    print("BENCHMARK: Isolation Forest (per-file, unsupervised, on mean+trend features)")
    print("=" * 70)
    if_df = evaluate_isolation_forest(labels)
    print(if_df.to_string(index=False))
    print(f"\nMean rank-decay score: {if_df['score'].mean():.3f}")

    print("\n" + "=" * 70)
    print("BENCHMARK: Logistic Regression (supervised, leave-one-file-out, class_weight=balanced)")
    print("=" * 70)
    lr_df = evaluate_logistic_regression(labels)
    print(lr_df.to_string(index=False))
    print(f"\nMean rank-decay score: {lr_df['score'].mean():.3f}")

    print("\n" + "=" * 70)
    print("CALIBRATION: score distribution across known-normal (car, file) instances")
    print("=" * 70)
    normal_scores = normal_instance_scores(labels)
    for pct in [50, 75, 90, 95, 99]:
        print(f"  p{pct}: {np.percentile(normal_scores, pct):.4f}")
    print(f"  n = {len(normal_scores)} known-normal instances")

    print("\n" + "=" * 70)
    print("HELD-OUT TEST FILE PREDICTION")
    print("=" * 70)
    test_files = list(core.iter_case_files(TEST_DIR))
    for path in test_files:
        result = core.predict_file(path)
        print(f"file_id: {result['file_id']}")
        print(f"schema matched: {result['schema_matched']}")
        print(f"empty cars: {result['empty_cars'] or '-'}")
        print(f"ranked_cars: {result['ranked_cars_str']}")
        print(f"margin (top vs 2nd): {result['margin']:.4f}" if result["margin"] is not None else "margin: n/a")

    print("\n" + "=" * 70)
    print("SANITY CHECKS")
    print("=" * 70)
    train_files = list(core.iter_case_files(TRAIN_DIR))
    print(f"Train files found (should be 6, lock file skipped): {len(train_files)}")
    print(" ", [os.path.basename(p) for p in train_files])

    r1 = core.predict_file(test_files[0])["ranked_cars_str"]
    r2 = core.predict_file(test_files[0])["ranked_cars_str"]
    print(f"Determinism check (two runs match): {r1 == r2}")

    case04_result = core.predict_file(os.path.join(TRAIN_DIR, "acv_case_04.xlsx"))
    print(f"case_04 all 8 header cars ranked: {len(case04_result['ranked_cars']) == 8}")
    print(f"case_04 empty cars (expect ['08']): {case04_result['empty_cars']}")
    print(f"case_04 empty car ranked last: {case04_result['ranked_cars'][-1] in case04_result['empty_cars']}")


if __name__ == "__main__":
    main()
