#!/usr/bin/env python3
"""
predict.py — Door subsystem fault classifier (NebulaX PS3)

Reads a raw door-telemetry CSV and writes one prediction per door cycle.

    python predict_door.py --input Test.csv --output door_predictions.csv

Self-contained: requires only pandas and numpy. No trained model file, no
pickle, no network access. The two decision thresholds were fitted on
Train.csv + Train_Segments_Answer.csv and are frozen as constants below.

--------------------------------------------------------------------------
THE ALGORITHM IN ONE LINE
    mechanical resistance = motor current / motor back-EMF
    a cycle is faulty when that ratio exceeds a per-operation threshold
--------------------------------------------------------------------------
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

__version__ = "1.0"

# ==========================================================================
# FROZEN MODEL PARAMETERS
# Fitted on Train.csv (110 labelled cycles). Train labels only — no Test data
# influenced these numbers. Each is the midpoint between the highest Normal
# and the lowest Abnormal value of the ratio, within that operation.
# ==========================================================================
THRESHOLDS = {
    "Open":  0.38434,
    "Close": 0.32315,
}

TRIM = 0.20              # fraction cut from EACH tail before averaging
GAP_THRESHOLD_S = 1.0    # a time gap larger than this starts a new cycle

LABEL_NORMAL = "Normal"
LABEL_ABNORMAL = "Abnormal resistance"

# --- column names, exactly as they appear in the dataset header ---
COL_TIME = "Datetime"
COL_CURRENT = "Motor current(mA)"
COL_EMF = "Motor electrodynamic force"
COL_POS = "Door leaf position"
COL_OPEN_CMD = "Open command"
COL_CLOSE_CMD = "Close command"
REQUIRED = [COL_TIME, COL_CURRENT, COL_EMF, COL_POS, COL_OPEN_CMD, COL_CLOSE_CMD]

# --- guard rails: flag, never reject (every cycle must get a prediction) ---
MIN_SEGMENT_ROWS = 40     # a 20% trimmed mean of fewer rows is meaningless
MIN_EMF_DENOM = 50.0      # floor the divisor so the ratio cannot explode
NEAR_THRESHOLD = 0.05     # within ±5% of the cut point → low confidence
TRAIN_ENVELOPE = {        # observed range on Train; used only to flag
    "Open":  {"rows": (137, 147), "pos_max": (690, 710)},
    "Close": {"rows": (178, 190), "pos_max": (690, 710)},
}


# ==========================================================================
# STEP 1 — PARSE TIMESTAMPS
# Format is Y-M-D-H-m-s-ms, hyphen-separated and NOT zero-padded, so
# pd.to_datetime cannot read it. Example: 2023-7-5-0-0-15-5 is
# 5 July 2023 at 00:00:15.005 (5 milliseconds, not 5000).
# ==========================================================================
def parse_time(s: str) -> datetime:
    y, mo, d, h, mi, se, ms = map(int, str(s).split("-"))
    return datetime(y, mo, d, h, mi, se) + timedelta(milliseconds=ms)


# ==========================================================================
# STEP 2 — SPLIT THE STREAM INTO CYCLES
# The file contains ONLY rows recorded during door movement. Between cycles
# the door sits idle and nothing is logged at all, leaving a hole in the
# timeline. Within a cycle, rows are 20 ms apart; between cycles the gap is
# 11-55 seconds. Those two regimes are ~500x apart, so the split point is
# not a tuned parameter — anything from 0.1s to 9s gives the same answer.
# ==========================================================================
def find_cycles(times: np.ndarray, gap_s: float = GAP_THRESHOLD_S):
    deltas = np.diff(times) / np.timedelta64(1, "s")
    cuts = [0] + [i + 1 for i, d in enumerate(deltas) if d > gap_s] + [len(times)]
    return [(cuts[k], cuts[k + 1]) for k in range(len(cuts) - 1)]


# ==========================================================================
# STEP 3 — IDENTIFY THE OPERATION
# 'Open command' on a cycle's FIRST row says whether the door is opening or
# closing. Verified 110/110 correct against the training answer key.
# Opening and closing need different thresholds because an opening door
# fights different forces than a closing one.
# ==========================================================================
def infer_operation(seg: pd.DataFrame) -> str:
    return "Open" if seg[COL_OPEN_CMD].iloc[0] == 1 else "Close"


# ==========================================================================
# STEP 4 — THE FEATURE: MECHANICAL RESISTANCE
#
#   back-EMF  is proportional to motor SPEED
#   current   is proportional to motor LOAD
#   so current / back-EMF  =  load per unit speed  =  MECHANICAL RESISTANCE
#
# which is exactly what the label "Abnormal resistance" names.
#
# Both are summarised with a 20% TRIMMED mean rather than a plain mean: the
# top tail is the end-of-travel latch spike (near-identical in healthy and
# faulty doors) and the bottom tail is the quiet coasting phase (also
# uninformative). Trimming concentrates on the sustained working-load region
# in between, which is where the class difference actually lives.
#
# Trimming is a choice of SUMMARY STATISTIC. No rows are deleted.
# ==========================================================================
def trimmed_mean(a: np.ndarray, proportion: float = TRIM) -> float:
    """20% trimmed mean. Matches scipy.stats.trim_mean without the dependency."""
    a = np.asarray(a, dtype=float)
    n = len(a)
    lo = int(proportion * n)
    hi = n - lo
    if lo >= hi:                      # too few rows to trim; fall back to the mean
        return float(a.mean())
    return float(np.sort(a)[lo:hi].mean())


# ==========================================================================
# STEP 5 — CLASSIFY, AND FLAG ANYTHING UNUSUAL
# ==========================================================================
def quality_flags(seg: pd.DataFrame, op: str, n_rows: int,
                  emf_denom: float, pos_max: float, margin: float) -> list[str]:
    flags = []
    first = seg.iloc[0]
    if first[COL_OPEN_CMD] == first[COL_CLOSE_CMD]:
        flags.append("ambiguous_operation")
    if n_rows < MIN_SEGMENT_ROWS:
        flags.append("short_segment")
    if emf_denom < MIN_EMF_DENOM:
        flags.append("low_back_emf")
    env = TRAIN_ENVELOPE.get(op)
    if env:
        lo, hi = env["rows"]
        if not (lo * 0.8 <= n_rows <= hi * 1.2):
            flags.append("length_outside_train_envelope")
        lo, hi = env["pos_max"]
        if not (lo * 0.8 <= pos_max <= hi * 1.2):
            flags.append("travel_outside_train_envelope")
    if abs(margin) < NEAR_THRESHOLD:
        flags.append("near_threshold")
    return flags


def confidence_tier(margin: float, flags: list[str]) -> str:
    """Tiers rather than a false-precision probability."""
    if any(f != "near_threshold" for f in flags):
        return "Low - review"
    if abs(margin) < NEAR_THRESHOLD:
        return "Low - review"
    return "Medium" if abs(margin) < 0.20 else "High"


# ==========================================================================
# THE PIPELINE
# ==========================================================================
def classify(df: pd.DataFrame, gap_s: float = GAP_THRESHOLD_S) -> pd.DataFrame:
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(
            "Input CSV is missing required column(s): " + ", ".join(missing)
            + "\nExpected the dataset's original header spelling, e.g. "
            + f"'{COL_CURRENT}' and '{COL_EMF}'."
        )
    if len(df) == 0:
        raise ValueError("Input CSV has a header but no data rows.")

    times = df[COL_TIME].map(parse_time).values.astype("datetime64[ns]")
    if not (np.diff(times) >= np.timedelta64(0)).all():
        raise ValueError("Timestamps are not in chronological order.")

    rows = []
    for a, b in find_cycles(times, gap_s):
        seg = df.iloc[a:b]
        op = infer_operation(seg)

        cur = trimmed_mean(seg[COL_CURRENT].values)
        emf_raw = trimmed_mean(seg[COL_EMF].values)
        emf = max(emf_raw, MIN_EMF_DENOM)            # guarded divisor
        ratio = cur / emf

        thr = THRESHOLDS[op]
        margin = (ratio - thr) / thr
        pos_max = float(seg[COL_POS].max())
        flags = quality_flags(seg, op, b - a, emf_raw, pos_max, margin)

        rows.append({
            "start_time": seg[COL_TIME].iloc[0],
            "end_time": seg[COL_TIME].iloc[-1],
            "prediction": LABEL_ABNORMAL if ratio > thr else LABEL_NORMAL,
            "operation": op,
            "n_rows": b - a,
            "trimmed_current": round(cur, 2),
            "trimmed_back_emf": round(emf_raw, 2),
            "resistance_ratio": round(ratio, 5),
            "threshold": thr,
            "margin_to_threshold": round(margin, 4),
            "confidence": confidence_tier(margin, flags),
            "quality_flags": ";".join(flags),
        })
    return pd.DataFrame(rows)


# ==========================================================================
# CLI
# ==========================================================================
def main(argv=None) -> int:
    p = argparse.ArgumentParser(
        prog="predict_door.py",
        description="Classify door open/close cycles as Normal or Abnormal resistance.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="example:\n  python predict_door.py --input Test.csv --output door_predictions.csv",
    )
    p.add_argument("--input", required=True, help="raw door telemetry CSV")
    p.add_argument("--output", required=True,
                   help="where to write door_predictions.csv (3 columns)")
    p.add_argument("--report", metavar="PATH", default=None,
                   help="optionally also write a detailed CSV with ratios, "
                        "confidence tiers and quality flags")
    p.add_argument("--gap", type=float, default=GAP_THRESHOLD_S, metavar="SECONDS",
                   help=f"cycle-split gap threshold (default {GAP_THRESHOLD_S}; "
                        "the result is identical anywhere from 0.1 to 9)")
    p.add_argument("--quiet", action="store_true", help="suppress the summary")
    p.add_argument("--version", action="version", version=f"predict_door.py {__version__}")
    args = p.parse_args(argv)

    try:
        df = pd.read_csv(args.input)
    except FileNotFoundError:
        print(f"ERROR: input file not found: {args.input}", file=sys.stderr)
        return 2
    except Exception as e:
        print(f"ERROR: could not read {args.input}: {e}", file=sys.stderr)
        return 2

    try:
        result = classify(df, gap_s=args.gap)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 3

    # The submission format: exactly three columns, no file_id, native timestamps.
    result[["start_time", "end_time", "prediction"]].to_csv(args.output, index=False)
    if args.report:
        result.to_csv(args.report, index=False)

    if not args.quiet:
        n_ab = int((result.prediction == LABEL_ABNORMAL).sum())
        flagged = int((result.quality_flags != "").sum())
        print(f"rows read          : {len(df):,}")
        print(f"cycles found       : {len(result)}")
        print(f"  Normal           : {len(result) - n_ab}")
        print(f"  Abnormal         : {n_ab}  ({n_ab / len(result):.0%})")
        print(f"cycles needing review: {flagged}")
        print(f"written            : {args.output}")
        if args.report:
            print(f"detailed report    : {args.report}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
