"""ACV refrigerant-leak localisation engine.

Ranks every car in a train's ACV telemetry file from most- to least-likely to have a
refrigerant leak. No model is trained: for each file independently, a car is judged
against the other cars present in that same file (its "siblings"), on the assumption
(guaranteed by the problem statement) that exactly one car per file is faulty.

Core signal: a leaking car cannot cool as effectively as a healthy one, so while it is
actively cooling, its cabin temperature sits further above its own setpoint than its
siblings' does. We measure that gap, per car, relative to the sibling median (not mean,
so the one faulty car can't drag its own baseline), averaged over cooling-active rows.

Column names differ between files (see ACV_Subsystem_Info_Kit.md) so nothing here assumes
a fixed schema — car IDs and signal columns are both discovered from each file's own
headers.
"""
import os
import re

import numpy as np
import pandas as pd

CAR_COL_RE = re.compile(r"^Car\s+(\S+)\s*-\s*(.+)$")

# (cabin-temperature column suffix, cooling-setpoint column suffix) pairs, tried in
# priority order against each file's own headers until one fully matches.
SIGNAL_CANDIDATES = [
    ("Indoor Average Temperature", "ACV Control Temperature (Cooling)"),
    ("Passenger Cabin Temperature Detected Value", "Target Temperature Value"),
]
RUNNING_MODE_SUFFIX = "ACV Running Mode"


def load_case(path):
    """Load one .xlsx case file and discover its car IDs from the header.

    Reads by sheet position (index 0), never by name — the held-out test file's sheet
    is not named "Sheet1" like the training files.
    """
    df = pd.read_excel(path, sheet_name=0)
    df["Time"] = pd.to_datetime(df["Time"])
    df = df.sort_values("Time").drop_duplicates(subset="Time", keep="first")
    df = df.reset_index(drop=True)

    car_ids = []
    seen = set()
    for col in df.columns:
        m = CAR_COL_RE.match(str(col))
        if m:
            car_id = m.group(1)
            if car_id not in seen:
                seen.add(car_id)
                car_ids.append(car_id)
    return df, car_ids


def resolve_signals(df, car_ids):
    """Find which known signal schema this file's columns match, and which cars in it
    actually carry usable (non-null) data for that schema.
    """
    for temp_suffix, setpoint_suffix in SIGNAL_CANDIDATES:
        temp_cols = {c: f"Car {c} - {temp_suffix}" for c in car_ids}
        setpoint_cols = {c: f"Car {c} - {setpoint_suffix}" for c in car_ids}
        if all(col in df.columns for col in temp_cols.values()) and all(
            col in df.columns for col in setpoint_cols.values()
        ):
            mode_cols = {c: f"Car {c} - {RUNNING_MODE_SUFFIX}" for c in car_ids}
            empty_cars = {
                c
                for c in car_ids
                if df[temp_cols[c]].isna().all() or df[setpoint_cols[c]].isna().all()
            }
            return {
                "schema": temp_suffix,
                "temp_cols": temp_cols,
                "setpoint_cols": setpoint_cols,
                "mode_cols": mode_cols,
                "empty_cars": empty_cars,
            }
    raise ValueError(f"No known signal schema matched this file's columns (car_ids={car_ids})")


def segment_by_time_gaps(df, max_gap_multiple=5):
    """Assign a segment id to each row, incrementing wherever the gap since the previous
    row exceeds max_gap_multiple times the file's modal sampling interval (e.g. overnight
    power-down breaks). Used only by the trend benchmark — the core scorer does not need
    continuity, since it just averages independent per-timestamp deviations.
    """
    diffs = df["Time"].diff()
    mode_vals = diffs.dropna().mode()
    modal_interval = mode_vals.iloc[0] if not mode_vals.empty else pd.Timedelta(seconds=30)
    threshold = modal_interval * max_gap_multiple
    is_new_segment = diffs.isna() | (diffs > threshold)
    return is_new_segment.cumsum(), modal_interval


def cooling_gap_frame(df, signals, usable_cars):
    """Per usable car, (cabin temp - setpoint) during cooling-active rows only, NaN
    elsewhere. Indexed by df's row order; shared by the core scorer and the benchmarks
    in validate.py so they measure the same underlying signal.
    """
    gaps = {}
    for c in usable_cars:
        temp = df[signals["temp_cols"][c]]
        setpoint = df[signals["setpoint_cols"][c]]
        mode = df[signals["mode_cols"][c]].astype(str)
        cooling_active = mode.str.contains("Cooling", case=False, na=False)
        gaps[c] = (temp - setpoint).where(cooling_active)
    return pd.DataFrame(gaps)


def score_cars(df, signals):
    """Compute one anomaly score per car: mean (temp - setpoint) deviation from the
    sibling median, over cooling-active rows only. Higher = more suspect. Cars with no
    usable data score NaN and are handled separately by rank_cars.
    """
    car_ids = list(signals["temp_cols"].keys())
    usable_cars = [c for c in car_ids if c not in signals["empty_cars"]]

    scores = {c: np.nan for c in car_ids}
    if not usable_cars:
        return scores

    gap_df = cooling_gap_frame(df, signals, usable_cars)
    sibling_median = gap_df.median(axis=1)
    deviation = gap_df.sub(sibling_median, axis=0)
    car_scores = deviation.mean(axis=0, skipna=True)

    for c in usable_cars:
        v = car_scores.get(c, np.nan)
        scores[c] = float(v) if pd.notna(v) else np.nan
    return scores


def rank_cars(scores, car_ids):
    """Sort every car ID (never dropping any) by score descending. Cars with no usable
    data (NaN score) always sort last. Ties/NaNs break deterministically by the order the
    car first appeared in the file's own header, so output never depends on run order.
    """
    def sort_key(c):
        score = scores.get(c, np.nan)
        is_nan = pd.isna(score)
        return (is_nan, -score if not is_nan else 0.0, car_ids.index(c))

    return sorted(car_ids, key=sort_key)


def format_ranked_cars(ranked):
    return "|".join(ranked)


def predict_file(path):
    """Run the full pipeline on one case file and return the prediction plus supporting
    detail (scores, margin, which schema matched, which cars had no data).
    """
    df, car_ids = load_case(path)
    signals = resolve_signals(df, car_ids)
    scores = score_cars(df, signals)
    ranked = rank_cars(scores, car_ids)

    valid_scores = sorted((s for s in scores.values() if pd.notna(s)), reverse=True)
    margin = valid_scores[0] - valid_scores[1] if len(valid_scores) >= 2 else None

    return {
        "file_id": os.path.basename(path),
        "ranked_cars": ranked,
        "ranked_cars_str": format_ranked_cars(ranked),
        "scores": scores,
        "margin": margin,
        "schema_matched": signals["schema"],
        "empty_cars": sorted(signals["empty_cars"]),
    }


def iter_case_files(directory):
    """Yield .xlsx case file paths in a directory, skipping Excel lock files (~$*)."""
    for name in sorted(os.listdir(directory)):
        if name.startswith("~$") or not name.lower().endswith(".xlsx"):
            continue
        yield os.path.join(directory, name)


# Risk bands for the UI. Cut-offs are percentiles of the mean-deviation score over the 42
# known-normal (car, file) instances in the training set (see validate.py calibration):
# yellow >= p90, red >= p95. The top-ranked car is always shown as "most likely faulty"
# regardless of band, since exactly one car per file is faulty.
SEVERITY_CUTOFFS = {"yellow": 0.148, "red": 0.171}


def severity(score):
    """Map a car's deviation score to a risk band: green / yellow / red / no data."""
    if score is None or pd.isna(score):
        return "no data"
    if score >= SEVERITY_CUTOFFS["red"]:
        return "red"
    if score >= SEVERITY_CUTOFFS["yellow"]:
        return "yellow"
    return "green"


def write_predictions_csv(results, output_path):
    """Write the submission CSV (file_id, ranked_cars) from a list of predict_file results."""
    import csv

    with open(output_path, "w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["file_id", "ranked_cars"])
        for r in results:
            writer.writerow([r["file_id"], r["ranked_cars_str"]])
