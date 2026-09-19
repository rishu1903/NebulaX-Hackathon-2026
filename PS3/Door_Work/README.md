# Door Subsystem — PS3

Sections follow the required list in `PS3_TEAM_AI_HANDOFF_GUIDE.md` §3.

---

## 1. What this subsystem predicts

Given a continuous, unlabelled stream of door telemetry, it:

1. **finds** each door open/close cycle in the stream, and
2. **classifies** each one as `Normal` or `Abnormal resistance`.

Operation (Open vs Close) is inferred internally because the two need different
thresholds, but it is not part of the required output.

---

## 2. Input format

A CSV of raw door telemetry. Six required columns, spelled exactly as in
`PS3/02_Datasets/Door/`:

| Column | Used for |
|---|---|
| `Datetime` | segmentation |
| `Motor current(mA)` | primary fault signal |
| `Motor electrodynamic force` | speed normaliser (back-EMF) |
| `Door leaf position` | quality flags |
| `Open command` | operation inference |
| `Close command` | ambiguity check |

Extra columns are ignored. Missing required columns give a clear error naming
them.

**Timestamps** use the dataset's native `Y-M-D-H-m-s-ms` format — hyphen
separated, *not* zero-padded. `2023-7-5-0-0-15-5` is 5 July 2023, 00:00:15.005
(5 milliseconds, not 5000). Standard parsers cannot read this, so
`predict_door.parse_time()` handles it.

---

## 3. Output format

`outputs/submission/door_predictions.csv` — official schema, exactly three
columns:

```csv
start_time,end_time,prediction
2023-7-5-0-0-0-0,2023-7-5-0-0-3-760,Normal
2023-7-5-0-5-46-252,2023-7-5-0-5-50-12,Abnormal resistance
```

One row per **door cycle**, expressed as the time range it occupied.
**No `file_id` column** — Door's test input is one continuous stream, not one
file per cycle. Labels are exactly `Normal` and `Abnormal resistance`.

The committed file is the `Test.csv` result: **38 cycles, 30 Normal, 8 Abnormal**.

`--report` writes an optional richer CSV (operation, row count, resistance
ratio, threshold applied, distance to it, confidence tier, quality flags) for
diagnostics and the app — never for submission.

---

## 4. Preprocessing

**Almost none, deliberately.** Both provided files were verified to contain zero
missing cells, malformed rows, duplicate or non-monotonic timestamps, parse
failures or out-of-range values.

Three standard reflexes would actively break this problem and are **not** applied:

| Reflex | Why it is wrong here |
|---|---|
| Impute the between-cycle gaps | They are idle periods, not missing data — and they are the entire segmentation signal |
| Remove outliers | The abnormal cycles *are* the statistical outliers; removing them deletes the positive class |
| Resample to a uniform grid | Manufactures rows during idle periods and erases the gap structure |

The only transformation is **rows → per-cycle features**
(6,253 rows → 38 cycles on Test).

### Segmentation

Within a cycle, rows are exactly 20 ms apart. Between cycles, nothing is logged
for 11–55 seconds. Splitting wherever the gap exceeds **1.0 s** reproduces the
official training boundaries **110/110, byte-identical** — arithmetic, not a
model. Any threshold from 0.1 s to 9 s gives the same result, so it is not a
tuned parameter.

---

## 5. Feature engineering

**Primary feature:** `trimmed_mean(current, 20%) ÷ trimmed_mean(back_EMF, 20%)`

Back-EMF is proportional to motor **speed**; current is proportional to
**load**. Their ratio is *load per unit speed* — **mechanical resistance**,
precisely what the label "Abnormal resistance" names. Chosen on physical
grounds, not because it separated best.

**Why not current alone.** Current measures how hard the motor works, not how
hard the door is to move. Train and Test are **two different doors** (their
recordings overlap in time, with 323 rows sharing a timestamp but showing
different readings), and the test door draws 5–8% more current for the same
work. A raw-current threshold fitted on one door misfires on the other; the
ratio is invariant to a common scaling of current and speed — enforced by a
unit test.

**Why trimmed.** Stroke-aligned analysis showed both tails carry no class
information: the top is the end-of-travel latch spike (near-identical in healthy
and faulty doors), the bottom is the quiet coast. All discriminative power sits
in the sustained working-load region, which 20% trimming isolates. Trimming is a
choice of summary statistic — **no rows are removed**.

Operation is inferred from `Open command` on each cycle's first row
(110/110 correct).

---

## 6. Model used

A **per-operation decision stump** — one threshold each:

```
Open  cycles:  ratio > 0.38434  →  Abnormal resistance
Close cycles:  ratio > 0.32315  →  Abnormal resistance
```

Each is the midpoint between the highest Normal and lowest Abnormal value in its
operation, fitted on **Train labels only**. They are frozen constants in
`src/predict_door.py` — no serialised model, no pickle, no retraining.

**Ten alternatives were grid-searched and rejected:** Logistic Regression,
SVM (RBF and linear), KNN, Decision Tree, Random Forest, Extra Trees, Gradient
Boosting, XGBoost, Gaussian Naive Bayes — each with repeated stratified CV.

Eight reached **100% cross-validation accuracy**, yet their Test predictions
ranged from **8 to 25 abnormal out of 38**. With the classes completely
separated, accuracy is saturated and cannot discriminate — so selection used
**prediction stability under bootstrap resampling** instead. The stump was the
only candidate whose Test predictions never changed across 60 refits
(sd 0.000). Five of the tuned models agree with it exactly.

Full table: `outputs/modeling/model_comparison.csv`.
Chosen configuration: `outputs/modeling/selected_model.json`.

---

## 7. Validation method

`Test.csv` has no answer key, so all generalisation estimates are manufactured
from the 110 labelled training cycles.

| Method | Purpose |
|---|---|
| Leave-one-out (110 folds) | Parameter overfitting |
| Chronological holdout (last 10–50 cycles) | The fitting *procedure*, end to end |
| Repeated stratified 5-fold × 6 | Comparing the ten candidate algorithms |
| Bootstrap resampling (60 refits) | Prediction stability — the criterion that decided selection |
| Permutation test (1,000 label shuffles) | Selection overfitting from searching 18 features |
| Train↔Test distribution overlay | Distribution shift; uses **no labels**, only unlabelled feature shape |

**No Test labels were used anywhere.** Thresholds are fitted on Train labels
alone and reported before any Test data is examined; the Test distribution
enters only afterwards as an unsupervised drift check.

---

## 8. Validation score

| Metric | Result |
|---|---|
| Accuracy on 110 labelled cycles | **100%** |
| Competition metric (IoU-weighted F1) on Train | **1.000**, all 110 matched |
| Leave-one-out accuracy | **99.1%** |
| Permutation test | **p < 0.001** (0/1000 shuffles matched the observed margin) |
| Bootstrap stability | 8/38 abnormal in **all 60** refits (sd 0.000) |
| Agreement with 5 tuned ML models | **identical predictions** |
| Trivial "all-Normal" baseline | 0.789 — the bar the model must clear |

Segmentation is exact, so every IoU equals 1.0 and the competition score
collapses to plain classification accuracy.

### Known limitations

- Faults milder than roughly a **25% resistance increase** are not detected.
- Only **two doors** of data exist; a third door's behaviour is unknown.
- The rule is **cost-symmetric**, but missing a fault costs far more than a
  false alarm. A deployed version should sit deliberately below the midpoint.
- One Test cycle (`2023-7-5-0-20-55-731`) is out-of-distribution — 807 position
  travel and 185 rows, both outside the Train envelope. Predicted `Normal`,
  flagged, surfaced as low-confidence rather than hidden.

---

## 9. Installing dependencies

```bash
pip install -r requirements.txt
```

Only **pandas** and **numpy** are needed to run; **pytest** for the tests.

---

## 10. Running training / inference

### Inference — this is all the submission needs

```bash
cd PS3/Door_Work
python src/predict_door.py \
    --input ../02_Datasets/Door/Test.csv \
    --output outputs/submission/door_predictions.csv
```

```
rows read          : 6,253
cycles found       : 38
  Normal           : 30
  Abnormal         : 8  (21%)
cycles needing review: 1
```

| Flag | Meaning |
|---|---|
| `--input` | **required** — raw telemetry CSV |
| `--output` | **required** — 3-column submission CSV |
| `--report` | optional detailed diagnostics CSV |
| `--gap` | cycle-split threshold in seconds (default 1.0; do not change) |
| `--quiet` | suppress the summary |

Exit codes: `0` success, `2` file unreadable, `3` data unusable.

### Training

**There is no training step to run.** The two thresholds are constants derived
from the labelled training data, recorded in
`outputs/modeling/selected_model.json`. The analysis that produced them is
documented in the full working copy (notebooks and figures), kept out of this
package to keep it small — available on request.

### Tests

```bash
cd PS3/Door_Work
pytest -q
```

**28 tests**, covering valid input, malformed input, feature/inference
consistency, output format and submission schema. They also assert that
`outputs/submission/door_predictions.csv` matches what the code currently
produces, so a stale submission file fails. Tests needing the official dataset
skip cleanly if it is not reachable.

---

## 11. How the app should call this

Import one function. The app never needs to know about training code,
thresholds or feature engineering.

```python
import sys
sys.path.insert(0, "PS3/Door_Work/src")
from door_app_adapter import predict_uploaded_file, write_submission

result = predict_uploaded_file(uploaded_file, source_name="Test.csv")
```

`uploaded_file` may be a path or any file-like object (Streamlit
`UploadedFile`, FastAPI upload, `io.BytesIO`).

**Returned dictionary:**

```python
{
  "subsystem": "Door",
  "source":    "Test.csv",
  "result": {
      "headline":      "8 of 38 door cycles show abnormal resistance",
      "cycles_found":  38,
      "normal":        30,
      "abnormal":      8,
      "abnormal_rate": 0.2105,
      "needs_review":  1,
  },
  "predictions": [        # one dict per cycle — ready for a table
      {"start_time": ..., "end_time": ..., "prediction": ...,
       "operation": ..., "confidence": ..., "quality_flags": ...},
  ],
  "details": {...},       # thresholds, feature description, model version
  "errors": None,         # a string if something went wrong
}
```

**The adapter never raises.** Bad input returns `errors` set and `predictions`
empty, so the UI displays a message instead of crashing.

Export the official CSV with:

```python
write_submission(result, "door_predictions.csv")
```

### Suggested UI treatment

- Show `result["headline"]` as the primary answer.
- Render `predictions` as a table; `confidence` is `High` / `Medium` /
  `Low - review`.
- Highlight rows with a non-empty `quality_flags` — cycles a human should check,
  not silent failures.
- Put `details` behind a "technical detail" expander.

---

## Folder contents

```
Door_Work/
├── README.md
├── requirements.txt
├── src/
│   ├── predict_door.py             # the algorithm + CLI (self-contained)
│   └── door_app_adapter.py         # app-facing interface (§11)
├── tests/
│   └── test_door_inference.py      # 28 tests
└── outputs/
    ├── modeling/
    │   ├── model_comparison.csv    # all 11 candidates: CV, LOO, stability
    │   └── selected_model.json     # chosen configuration + scores
    └── submission/
        └── door_predictions.csv    # THE deliverable
```

`src/predict_door.py` and `src/door_app_adapter.py` are the only files the
submission and the app depend on, and they need only pandas and numpy.

Analysis notebooks and figures were kept out of this package — they are evidence
for the write-up rather than anything needed to run or submit. Available
separately.
