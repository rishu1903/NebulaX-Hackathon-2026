"""Checks for the submitted rail inference contract and CSV schema."""

import csv
import sys
import unittest
from pathlib import Path

import pandas as pd

WORK = Path(__file__).resolve().parents[1]
PS3 = WORK.parent
sys.path.insert(0, str(WORK / "src"))

from inference import predict_dataframe, predict_file  # noqa: E402


class RailInferenceTests(unittest.TestCase):
    def test_known_labeled_files(self):
        train = PS3 / "02_Datasets" / "Rail_Corrugation" / "Train"
        expected = {
            "Train1.csv": "Normal",
            "Train2.csv": "Side II",
            "Train5.csv": "Normal",
            "Train62.csv": "Side I",
        }
        for filename, label in expected.items():
            with self.subTest(filename=filename):
                result = predict_file(train / filename)
                self.assertEqual(result["prediction"], label)
        self.assertTrue(predict_file(train / "Train5.csv")["low_transition_override"])

    def test_malformed_recording_rejected(self):
        with self.assertRaisesRegex(ValueError, "10000 rows"):
            predict_dataframe(pd.DataFrame([[0.0] * 129]), "bad.csv")

    def test_submission_schema(self):
        path = WORK / "outputs" / "submission" / "rail_predictions.csv"
        with path.open(newline="", encoding="utf-8-sig") as stream:
            reader = csv.DictReader(stream)
            self.assertEqual(reader.fieldnames, ["file_id", "prediction"])
            rows = list(reader)
        self.assertEqual(len(rows), 68)
        self.assertEqual({r["file_id"] for r in rows}, {f"Test{i}.csv" for i in range(1, 69)})
        self.assertTrue(all(r["prediction"] in {"Normal", "Side I", "Side II"} for r in rows))


if __name__ == "__main__":
    unittest.main()
