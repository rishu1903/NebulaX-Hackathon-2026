"""Inference entry point for the ACV subsystem.

    python predict.py --input <file.xlsx | directory of .xlsx> --output acv_predictions.csv

Writes one row per file: file_id, ranked_cars (every car, most- to least-likely faulty,
IDs exactly as they appear in that file's headers, joined by "|").
"""
import argparse
import os
import sys

from acv_core import iter_case_files, predict_file, write_predictions_csv


def main(argv=None):
    parser = argparse.ArgumentParser(description="Rank ACV cars by refrigerant-leak likelihood.")
    parser.add_argument("--input", required=True, help="An .xlsx case file, or a directory of them")
    parser.add_argument("--output", required=True, help="Path of the acv_predictions.csv to write")
    args = parser.parse_args(argv)

    paths = list(iter_case_files(args.input)) if os.path.isdir(args.input) else [args.input]
    if not paths:
        sys.exit(f"No .xlsx case files found in {args.input}")

    results = [predict_file(p) for p in paths]
    write_predictions_csv(results, args.output)
    for r in results:
        print(f"{r['file_id']}: {r['ranked_cars_str']}")
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
