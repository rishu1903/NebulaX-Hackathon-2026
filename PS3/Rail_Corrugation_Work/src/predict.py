"""Generate the official-format rail prediction CSV using the frozen model."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

from inference import predict_file

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TEST = ROOT / "02_Datasets" / "Rail_Corrugation" / "Test"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "outputs" / "submission" / "rail_predictions.csv"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--test-dir", type=Path, default=DEFAULT_TEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    files = sorted(args.test_dir.glob("Test*.csv"), key=lambda p: int(p.stem[4:]))
    expected = {f"Test{i}.csv" for i in range(1, 69)}
    if {p.name for p in files} != expected or len(files) != 68:
        raise ValueError("Expected exactly Test1.csv through Test68.csv")

    rows = []
    for path in files:
        result = predict_file(path)
        rows.append({"file_id": result["file_id"], "prediction": result["prediction"]})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=["file_id", "prediction"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} predictions to {args.output}")


if __name__ == "__main__":
    main()
