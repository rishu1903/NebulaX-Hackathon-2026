# ACV — refrigerant-leak localisation

## Task
Each ACV file holds 8 cars' telemetry; exactly one car has a refrigerant leak. We must rank
all cars from most- to least-likely faulty (score = (n − (r − 1)) / n, averaged over files).

## Approach
**Per-file, unsupervised scorer — nothing is fitted across files.**

1. Discover cars and signal columns from each file's own headers (schemas differ between
   train groups; the test sheet is not named `Sheet1`, so sheets are read by position).
2. Keep only **cooling-active** rows (`ACV Running Mode` contains "Cooling"); a refrigerant
   leak only shows under cooling demand.
3. Per car and timestamp, compute `gap = cabin temperature − cooling setpoint`.
4. Subtract the **median gap across sibling cars** at that timestamp (median, so the one faulty
   car cannot drag its own baseline).
5. Average that deviation over time. Highest score = most likely faulty; all 8 cars are
   always emitted, cars with no data last.

Why not a trained classifier? Only 6 labelled files (6 positive cars, 42 negatives) exist and
labels are 01, 02, 03, 01, 04, 06, so any model using car ID would learn a spurious
"low-numbered cars fail" pattern. Comparing each car against its siblings in the same file
removes the file/season/train effect (outdoor temperature, load) that dominates raw values.

**Data cleaning is deliberately minimal:** sort by time, drop duplicate timestamps, leave NaN
dropouts alone (the per-timestamp median/mean are NaN-aware, so imputation adds nothing and
risks inventing values). Car IDs are emitted exactly as in the headers.

## Validation (leave-one-file-out, `validate.py`)
| File | True car | Rank | Score |
|---|---|---|---|
| case_01 | 01 | 1 | 1.000 |
| case_02 | 02 | 1 | 1.000 |
| case_03 | 03 | 1 | 1.000 |
| case_04 | 01 | 2 | 0.875 |
| case_05 | 04 | 1 | 1.000 |
| case_06 | 06 | 1 | 1.000 |
| **mean** | | | **0.979** |

**Model comparison** (same harness): windowed mean + trend 0.979; logistic regression
(supervised, leave-one-file-out) 0.979; Isolation Forest 0.958. None beats the simple scorer,
so extra complexity is not adopted.

**Robustness (`sensitivity.py`):** the true car stays ranked 1st on all five Group A/C files
with a mean instead of median baseline, without the cooling mask, and without the sibling
baseline. It slips to 2nd only on case 05 when using the first half of the file alone.

## Limitations (stated honestly)
- The scoring rule was designed after inspecting the labelled files, so 0.979 / 1.000 is not a
  clean held-out estimate; n = 5 comparable files. Robustness checks above are the mitigation.
- Margins vary widely (case 06: 1.197, case 05: 0.021); thin-margin files are fragile.
- **case_04 (different, ~60-parameter schema):** cars 05–08 have columns in every row but each cell holds the literal text "None" (no
  measurement, so they carry no usable signal and are ranked last), and the true
  car ranks 2nd of 8. Case 04's refrigerant pressures single out car 04, not the labelled car
  01, so we did not add a pressure feature — tuning to one file would be fitting to it.
- Only Group A/C-style temperature signals are assumed for the scored (Model A) test file.

## Risk colours
Cut-offs come from the score distribution of the 42 known-normal (car, file) instances:
red ≥ 0.171 (p95), yellow ≥ 0.148 (p90), green below. The top-ranked car is always reported as
"inspect first". On the test file, car 01 scores 0.226 (red); the next car scores 0.048.

## Test-file prediction
`acv_test_case.xlsx` → `01|03|07|04|08|06|02|05`

## Run it
```
pip install pandas openpyxl scikit-learn streamlit
python predict.py --input ../02_Datasets/ACV/Test/acv_test_case.xlsx --output output/acv_predictions.csv
streamlit run app.py          # upload -> ranked table -> download CSV
python validate.py            # leave-one-file-out + benchmarks
python sensitivity.py         # design-choice robustness
```
