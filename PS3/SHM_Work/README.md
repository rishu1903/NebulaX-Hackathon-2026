# SHM Work Area

This folder contains read-only preprocessing and audit utilities for Problem
Statement 3 Structural Health Monitoring (SHM).

## Raw Data Rule

Never modify files inside `PS3/02_Datasets/SHM/`.

The raw train and test CSVs are the source of truth. Any audit outputs,
intermediate files, cleaned views, features, or model artifacts must be written
outside the raw dataset folder, under `PS3/SHM_Work/` or another explicit work
area.

## `src/audit_shm.py`

`audit_shm.py` performs the first-pass dataset audit only. It does not delete,
clip, normalize, interpolate, model, or feature-engineer signal values.

The script:

- discovers train and test CSV files using `pathlib`
- loads `Train_Labels.csv`
- checks for duplicate label filenames
- checks that each training signal file has one matching label
- reads each raw signal as a headerless single numeric column
- records row count, NaN count, positive/negative infinity counts,
  non-numeric count, min, max, mean, median, standard deviation, RMS, unique
  value count, exact zero count, and constant-signal flag
- writes one audit row per source file to `outputs/shm_audit.csv`
- prints a terminal summary of file counts and any detected issues

Run from the repository root:

```powershell
python PS3\SHM_Work\src\audit_shm.py
```
