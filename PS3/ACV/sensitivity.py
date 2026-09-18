"""Sensitivity of the core scorer's design choices, on the five Group A/C labelled files.

Shows the true faulty car's rank under variants of the scoring rule, to check the 1.000
leave-one-file-out result is not an artefact of one design choice.
"""
import os
import warnings

import pandas as pd

import acv_core as a

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
DATASET_DIR = os.path.join(HERE, "..", "02_Datasets", "ACV")
FILES = ["acv_case_01", "acv_case_02", "acv_case_03", "acv_case_05", "acv_case_06"]


def variants(df, sig, cars):
    use = [c for c in cars if c not in sig["empty_cars"]]
    raw = pd.DataFrame({c: df[sig["temp_cols"][c]] - df[sig["setpoint_cols"][c]] for c in use})
    cool = pd.DataFrame(
        {c: df[sig["mode_cols"][c]].astype(str).str.contains("Cooling", case=False, na=False) for c in use}
    )

    def dev(g, base="median"):
        b = g.median(axis=1) if base == "median" else g.mean(axis=1)
        return g.sub(b, axis=0).mean()

    n = len(df) // 2
    return {
        "core (median baseline, cooling rows)": dev(raw.where(cool)),
        "mean baseline": dev(raw.where(cool), "mean"),
        "all rows (no cooling mask)": dev(raw),
        "no sibling baseline (raw gap)": raw.where(cool).mean(),
        "first half of file only": dev(raw.where(cool).iloc[:n]),
        "second half of file only": dev(raw.where(cool).iloc[n:]),
    }


def main():
    labels = pd.read_csv(os.path.join(DATASET_DIR, "Train_Labels.csv"), dtype=str).set_index("filename")["faulty_car"]
    ranks = {}
    for f in FILES:
        df, cars = a.load_case(os.path.join(DATASET_DIR, "Train", f + ".xlsx"))
        sig = a.resolve_signals(df, cars)
        for name, scores in variants(df, sig, cars).items():
            order = list(scores.sort_values(ascending=False).index)
            ranks.setdefault(name, {})[f[-2:]] = order.index(labels[f + ".xlsx"]) + 1
    table = pd.DataFrame(ranks).T
    table["mean_score"] = ((8 - (table - 1)) / 8).mean(axis=1).round(3)
    print("Rank of the true faulty car (1 = best), per case:")
    print(table)


if __name__ == "__main__":
    main()
