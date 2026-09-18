# SHM Solution: Problem Statement 3

## 1. Overview

This module solves the Structural Health Monitoring (SHM) task in Problem
Statement 3.

Input: a one-dimensional dynamic stress time-series CSV.

Output: one numeric cumulative fatigue-damage prediction.

Cumulative fatigue matters because rail vehicle load-bearing structures, such
as carbodies and bogie frames, experience repeated stress cycles over time.
Even when each individual load is not catastrophic, repeated loading can
accumulate damage and reduce remaining structural life.

## 2. Dataset

The SHM dataset contains:

- 64 training files
- 16 official test files
- one stress measurement column per file
- 581,120 samples per file
- `Train_Labels.csv`, with one cumulative damage target per training file

One entire CSV file is one ML observation. Individual signal rows are not
treated as supervised samples.

## 3. Data Quality Audit

The raw data audit found:

- no missing labels
- no duplicate labels
- no unexpected row counts
- no NaN values
- no Inf values
- no non-numeric values
- no constant signals

Raw outliers and extreme stress values were not automatically removed. Large
stress excursions can be physically meaningful in fatigue analysis because rare
high-amplitude cycles may contribute heavily to cumulative damage.

## 4. EDA Findings

Basic stress magnitude features were strongly associated with damage. In
particular, `peak_to_peak` had Spearman correlation with damage of about
`0.962`.

This shows that larger stress ranges are important, but simple magnitude alone
does not fully describe fatigue accumulation. Fatigue depends on both stress
range and how often damaging cycles occur.

## 5. Fatigue Feature Engineering

Rainflow counting is a standard fatigue-analysis method for turning an
irregular stress time series into load cycles. In plain English, it identifies
the ups and downs in the signal that behave like repeated stress cycles, then
records each cycle's stress range and count.

The key engineered feature is:

```text
fatigue_power_5 = sum(cycle_count * stress_range^5)
```

This captures both:

- the number of load cycles
- the severity of each stress cycle

The fifth power makes large stress ranges count much more heavily, which
matches the physical intuition that high-amplitude cycles can dominate fatigue
damage.

`fatigue_power_5` showed approximately `0.9997` Pearson correlation with
training damage. This is strong evidence that the feature matches the target
construction, but correlation alone does not prove generalisation.

## 6. Final Model

The final selected model is:

```text
predicted_damage = k * fatigue_power_5
```

Final fitted coefficient:

```text
k = 4.2742163879400325e-11
```

This coefficient was calibrated from all 64 labelled training samples only
after model selection and cross-validation were completed.

## 7. Validation

Model selection used honest repeated cross-validation:

```text
RepeatedKFold
n_splits = 5
n_repeats = 20
random_state = 42
```

Final selected model performance:

```text
mean MAPE = 0.0264144452
mean competition score = 0.9735855548
```

Important comparisons:

- Dummy median MAPE: about `0.949`
- Peak-to-peak linear MAPE: about `1.152`
- `fatigue_power_5` linear MAPE: about `0.0276`
- Physics `k * fatigue_power_5` MAPE: about `0.0264`

All coefficients, scalers, and preprocessing used during validation were fitted
inside each training fold. The official test set was not used for model
selection.

## 8. Project Structure

Source files:

- `src/audit_shm.py`: read-only data audit for train/test file integrity and
  signal quality.
- `src/eda_shm.py`: exploratory analysis, target plots, representative signal
  plots, basic statistics, and correlation summaries.
- `src/extract_shm_features.py`: full-signal feature extraction, including
  rainflow and fatigue-power features.
- `src/model_shm_baselines.py`: leakage-safe repeated-CV model benchmarking.
- `src/predict_shm.py`: final batch inference for the official SHM test files.
- `src/shm_inference.py`: app-facing single-file inference function.
- `tests/test_shm_pipeline.py`: pytest checks for feature consistency,
  prediction consistency, generated submission consistency, and upload
  validation failures.

Key output folders:

- `outputs/`: audit files, EDA summaries, feature tables, and derived CSVs.
- `outputs/figures/`: EDA figures.
- `outputs/modeling/`: cross-validation results, out-of-fold predictions,
  model figures, and physics coefficient diagnostics.
- `outputs/submission/`: final SHM submission CSV and final model metadata.

## 9. How To Run

Run commands from the repository root in Windows PowerShell.

Setup:

```powershell
python -m pip install -r PS3/SHM_Work/requirements.txt
```

Audit:

```powershell
python PS3\SHM_Work\src\audit_shm.py --data-root PS3\02_Datasets\SHM
```

EDA:

```powershell
python PS3\SHM_Work\src\eda_shm.py --data-root PS3\02_Datasets\SHM
```

Feature extraction:

```powershell
python PS3\SHM_Work\src\extract_shm_features.py --data-root PS3\02_Datasets\SHM
```

Model benchmarking:

```powershell
python PS3\SHM_Work\src\model_shm_baselines.py
```

Final batch prediction:

```powershell
python PS3\SHM_Work\src\predict_shm.py --data-root PS3\02_Datasets\SHM
```

Single-file inference:

```powershell
python PS3\SHM_Work\src\shm_inference.py PS3\02_Datasets\SHM\Test\test01.csv
```

Tests:

```powershell
pytest PS3\SHM_Work\tests\test_shm_pipeline.py -v
```

## 10. App Integration

The final unified PS3 app should call `predict_shm_file` for a user-uploaded
SHM CSV:

```python
from shm_inference import predict_shm_file

result = predict_shm_file(path)
prediction = result["prediction"]
```

The returned dictionary also includes `fatigue_power_5` and `model_name` for
display, logging, or explainability.

## 11. Submission

The official-format SHM prediction file is:

```text
outputs/submission/shm_predictions.csv
```

It has exactly:

```text
file_id,prediction
```

and exactly 16 rows, one for each official test file.

## 12. Important Methodology Notes

- Filenames are never predictive features.
- Official test labels are unavailable and were never used.
- Raw signals are not normalized.
- Raw signals are not clipped.
- Extreme observations are not automatically removed.
- Rainflow uses the full signal.
- No test-set model selection is performed.
- Raw data must not be modified; all derived artifacts belong under
  `PS3/SHM_Work/outputs/`.
