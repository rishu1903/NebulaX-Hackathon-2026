# Frozen Variant A validation summary

Training set: 272 files (234 Normal, 14 Side I, 24 Side II). Features: 43 baseline values per recording. Model: 50% LightGBM, 30% histogram gradient boosting, 20% class-weighted random forest soft vote, with a Normal override at no more than 50 wheel-pulse transitions.

Five-fold stratified CV, seed 42: accuracy **257/272 = 94.49%**, mean fold macro F1 **0.7915**, pooled out-of-fold macro F1 **0.7945**. The mean and pooled figures are different summaries of the same folds.

| True class | Pred Normal | Pred Side I | Pred Side II |
| --- | ---: | ---: | ---: |
| Normal | 229 | 3 | 2 |
| Side I | 4 | 8 | 2 |
| Side II | 1 | 3 | 20 |

Variant A pooled macro F1 across seeds 42, 101, 2024, 777, 9999: **0.7945, 0.7929, 0.8322, 0.7762, 0.8044**. Side I recall ranged from 8/14 to 10/14. These splits reuse the same recordings and are not independent test sets.

Variant B (five localized top-three vibration features) improved seed-42 mean fold macro F1 to 0.8129 but improved the five-seed mean by only 0.0032. Variant W (six per-channel Welch features) reduced five-seed mean macro F1 from 0.7962 to 0.7825 and average Side I recall from 8.6/14 to 7.8/14. Neither was adopted. Further tuning on only 14 Side I files risks overfitting.

The saved model was fitted on all 272 labeled files. The 68 official test labels are unknown.
