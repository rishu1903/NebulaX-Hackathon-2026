# PS3 Team Contribution & AI Handoff Guide

Use this file as the instruction sheet for any AI coding assistant (Codex, Claude, ChatGPT, etc.) before preparing a teammate's PS3 branch for merge.

## 1. Goal

This repository contains four independent Problem Statement 3 subsystems:

- Door
- ACV
- Rail Corrugation
- SHM

Each contributor should keep their subsystem work isolated in its own folder and branch. Do not mix experimental files, local environments, editor settings, or another teammate's subsystem into your contribution.

The target structure is:

```text
PS3/
├── 01_Problem_Statement_3_Specifications.md
├── 02_Datasets/                     # OFFICIAL DATA — do not modify
├── 03_References/                   # OFFICIAL REFERENCES — do not modify
├── 04_Example_Submission/           # OFFICIAL EXAMPLES — do not modify
│
├── Door_Work/
│   ├── README.md
│   ├── requirements.txt
│   ├── src/
│   ├── tests/
│   └── outputs/
│       ├── modeling/
│       └── submission/
│           └── door_predictions.csv
│
├── ACV_Work/
│   ├── README.md
│   ├── requirements.txt
│   ├── src/
│   ├── tests/
│   └── outputs/
│       ├── modeling/
│       └── submission/
│           └── acv_predictions.csv
│
├── Rail_Corrugation_Work/
│   ├── README.md
│   ├── requirements.txt
│   ├── src/
│   ├── tests/
│   └── outputs/
│       ├── modeling/
│       └── submission/
│           └── rail_predictions.csv
│
├── SHM_Work/
│   ├── README.md
│   ├── requirements.txt
│   ├── src/
│   ├── tests/
│   └── outputs/
│       ├── modeling/
│       └── submission/
│           └── shm_predictions.csv
│
└── app/                              # shared unified app; integration work only
    └── ...
```

If a subsystem needs a serialized model, scaler, encoder, or other runtime artifact, place it inside that subsystem's work folder, for example:

```text
PS3/<Subsystem>_Work/models/
```

Do not place subsystem-specific model files at repository root.

## 2. Branch Rules

Each teammate should work on a separate branch.

Recommended branch names:

```text
door/model
acv/model
rail/model
shm/preprocessing
```

or equivalent clear names.

Before starting new work:

```bash
git checkout main
git pull origin main
git checkout <your-branch>
git merge main
```

If the team prefers rebase:

```bash
git checkout <your-branch>
git fetch origin
git rebase origin/main
```

Do not work directly on `main` unless the team explicitly agrees to do so.

When the subsystem is complete:

1. Clean the branch.
2. Run its tests.
3. Verify the prediction file.
4. Commit the final cleaned state.
5. Push the branch.
6. Review the branch diff against `main`.
7. Merge through a pull request or an agreed team merge process.

## 3. Files Every Subsystem Should Have

Each `<Subsystem>_Work/` folder should contain, where applicable:

### `README.md`

Explain:

- what the subsystem predicts
- input format
- output format
- preprocessing
- feature engineering
- model used
- validation method
- validation score
- how to install dependencies
- how to run training / inference
- how the final app should call the inference code

### `requirements.txt`

Only include packages actually required by that subsystem.

### `src/`

Keep production and research code here.

Typical examples:

```text
audit_*.py
eda_*.py
extract_*_features.py
model_*_baselines.py
predict_*.py
*_inference.py
*_app_adapter.py
```

Not every subsystem needs every file. Keep only what is useful.

### `tests/`

Include tests that protect the final inference pipeline.

At minimum, test:

- valid input
- malformed input
- feature/inference consistency where relevant
- prediction output format
- submission schema

### `outputs/modeling/`

Keep only small, useful evidence of model selection or validation.

Examples:

- CV summary
- benchmark summary
- selected-model metadata

Do not commit huge temporary experiment dumps.

### `outputs/submission/`

This folder must contain the subsystem's final official-format prediction CSV.

## 4. Official Prediction Files

Before merging, verify the final prediction file against the official PS3 specification and `PS3/04_Example_Submission/`.

### Door

File:

```text
door_predictions.csv
```

Special schema:

```text
start_time,end_time,prediction
```

There is no `file_id` column.

### ACV

File:

```text
acv_predictions.csv
```

Special schema:

```text
file_id,ranked_cars
```

There is no ordinary `prediction` column.

### Rail Corrugation

File:

```text
rail_predictions.csv
```

Schema:

```text
file_id,prediction
```

Prediction must be one of:

```text
Normal
Side I
Side II
```

### SHM

File:

```text
shm_predictions.csv
```

Schema:

```text
file_id,prediction
```

Prediction is one numeric cumulative-fatigue-damage value per test file.

Do not invent a new schema. Use the official specification and example files as the source of truth.

## 5. App Integration Contract

Each subsystem should expose a small app-facing inference function or adapter.

The unified app should NOT need to understand training code.

Conceptually:

```python
result = predict_uploaded_file(...)
```

The result should provide:

- subsystem name
- source file identifier
- primary prediction/result
- optional technical details

Subsystem code remains inside its own `<Subsystem>_Work/` folder.

Shared UI code belongs under:

```text
PS3/app/
```

Do not place Streamlit/React/FastAPI UI code inside another teammate's subsystem folder unless it is specifically a subsystem adapter.

Do not modify `PS3/app/` unless you are assigned to app integration or have coordinated the change with the team.

## 6. Do Not Commit Local or Generated Junk

The following should not be tracked:

```text
.venv/
venv/
__pycache__/
*.pyc
.pytest_cache/
.vscode/
.agents/
.env
.env.*
*.pem
*.key
```

Also avoid committing:

- temporary upload files
- OS-generated files
- giant debug logs
- caches
- redundant copies of datasets
- duplicate model experiments
- local absolute paths
- intermediate plots unless they are intentionally needed for the write-up
- intermediate prediction CSVs that are not the final submission artifact

The repository's `.gitignore` should cover these patterns.

If a junk file is already tracked, adding it to `.gitignore` is not enough. Remove it from Git tracking as part of the cleanup.

## 7. Raw Data Rules

Treat these as read-only:

```text
PS3/02_Datasets/
PS3/03_References/
PS3/04_Example_Submission/
PS3/01_Problem_Statement_3_Specifications.md
```

Do not:

- rename official files
- modify labels
- overwrite raw test/train data
- move official datasets into your work folder
- commit additional duplicate dataset copies

Derived artifacts belong under your subsystem's `_Work/` folder.

## 8. Pre-Merge AI Checklist

Before committing the final branch, the AI assistant must inspect:

```bash
git status
git diff --stat
git diff --cached --stat
git diff main...HEAD --name-status
```

Then verify all of the following:

- [ ] Only the intended subsystem work is being introduced.
- [ ] No raw dataset files were modified.
- [ ] No official reference/specification/example files were modified.
- [ ] No `.venv`, `.agents`, `.vscode`, cache, or secret files are tracked.
- [ ] No unrelated teammate work is deleted.
- [ ] The subsystem has a README.
- [ ] Dependencies are documented.
- [ ] Inference can run without retraining.
- [ ] Tests pass.
- [ ] Final prediction CSV exists.
- [ ] Final prediction CSV schema matches the official example.
- [ ] No hidden test labels were used.
- [ ] No filename or arbitrary row/file number is used as a predictive feature unless the official task explicitly makes it meaningful.
- [ ] Temporary/generated files are cleaned up.

If any suspicious unrelated deletion or modification appears, STOP and report it rather than committing.

## 9. AI Cleanup Instruction

When asking an AI assistant to prepare the branch for merge, give it this instruction:

> Inspect my current branch against `main`. Preserve all legitimate work for my assigned PS3 subsystem, but remove local environments, caches, editor files, AI-agent files, redundant intermediate outputs, and other generated junk. Do not modify raw datasets, official references, example submissions, another teammate's subsystem, or shared app code unless I explicitly worked on it. Ensure my subsystem follows `PS3/<Subsystem>_Work/{README.md,requirements.txt,src/,tests/,outputs/}`. Keep the final official prediction CSV under `outputs/submission/`. Run the subsystem tests, validate the prediction schema against the official PS3 specification/example, then show me `git status` and the diff summary. Do not commit or push until I review it.

## 10. Merge Philosophy

`main` should become the clean integration branch containing the best completed version of every teammate's work.

A healthy flow is:

```text
main
 ├── door/model ───────────────┐
 ├── acv/model ────────────────┤
 ├── rail/model ───────────────┼──> reviewed merges ──> main
 └── shm/preprocessing ────────┘
```

Everyone can see everyone else's completed work after it is merged into `main`.

Do not merge half-clean branches simply so files become visible. Push the branch first; teammates can inspect it on GitHub before the merge.

## 11. Final Team-Level Deliverables

Near submission time, the team will combine subsystem outputs into one:

```text
predictions.zip
```

At the top level of that zip, include only the prediction CSVs for attempted subsystems, for example:

```text
predictions.zip
├── door_predictions.csv
├── acv_predictions.csv
├── rail_predictions.csv
└── shm_predictions.csv
```

No subfolders inside `predictions.zip`.

The final unified app should support every subsystem the team submits.

The team will also need the compulsory demo video required by the PS3 specification.

Do not confuse subsystem development outputs with the final `predictions.zip`; the subsystem's `outputs/submission/` directory is the clean source from which the final team package is assembled.
