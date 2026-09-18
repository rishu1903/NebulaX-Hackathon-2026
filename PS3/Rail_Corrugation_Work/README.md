# Rail corrugation model

This folder is the rail team's self-contained PS3 contribution. It classifies each one-second, 10,000-row, 129-column rail recording as `Normal`, `Side I`, or `Side II`. Official raw data and reference files remain in the sibling `PS3/02_Datasets/` and `PS3/03_References/` directories.

## Files

- `src/features.py`: speed, centered vibration/shock, side-contrast, and spectral features.
- `src/model_def.py`: Variant A soft-voting ensemble and low-transition override.
- `src/inference.py`: app-facing `predict_dataframe`, `predict_csv_bytes`, and `predict_file` functions. They load the saved model without retraining.
- `src/predict.py`: generate the official-format test prediction CSV from the saved model.
- `src/train.py`: reproduce the 43-feature training and five-fold validation recipe. Training is optional for inference.
- `models/rail_corrugation_model.joblib`: fitted Variant A model plus ordered feature schema.
- `outputs/submission/rail_predictions.csv`: final rail prediction file, with `file_id,prediction` and one row for each of `Test1.csv` through `Test68.csv`.
- `outputs/modeling/validation_summary.md`: model selection evidence and limits.

## Setup and use

From `PS3/Rail_Corrugation_Work/`:

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # Windows
.venv/Scripts/python src/predict.py                         # Windows
.venv/Scripts/python -m unittest discover -s tests -v      # Windows
```

On Linux/macOS, use `.venv/bin/python` instead. `src/predict.py` reads the official test directory and writes `outputs/submission/rail_predictions.csv`. To reproduce training from official labeled data, run `python src/train.py`; this overwrites the model artifact, so run it only when retraining is intended.

The unified app can import `src.inference.predict_csv_bytes` and pass uploaded CSV bytes. The result includes `prediction`, `file_id`, estimated speed, pulse-transition count, and whether the low-transition rule was applied. The app can display waveform data separately. Keep UI and cross-subsystem integration code in `PS3/app/`.

## Validation and limitations

Five-fold stratified CV (seed 42) gave mean fold macro F1 **0.7915** and 257/272 correct predictions. Out-of-fold recall was Normal **229/234**, Side I **8/14**, Side II **20/24**. Side I is the weak class. Localized top-three features gave an inconsistent gain across five seeds; extra Welch features made average results worse, so Variant A was retained. See `outputs/modeling/validation_summary.md`.

The `is_stationary` code flag means **at most 50 transitions**, including slow movement up to about 2.67 km/h; it is an empirical Normal override, not proof the rail is healthy. The 68 test labels are unknown, so prediction distribution and app/batch agreement are not measures of test accuracy. Model scores are not calibrated probabilities.

The joblib file should only be loaded from this trusted team repository. Reproducing it from source may depend on installed library versions; the checked-in model allows inference without retraining.
