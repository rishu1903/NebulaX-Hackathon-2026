# ProactiveRail: Telemetry-Driven Fault Triage

## Introduction

Trains constantly generate sensor data, known as telemetry, from their doors and bogies (the wheel and suspension units under each carriage). At the moment, most of this data only gets looked at after something has already broken. This project builds a system that catches warning signs earlier, using machine learning to flag unusual behaviour before it becomes a breakdown, and presents the result through two purpose-built views: one for the night shift engineers who need to act on it, and one for anyone who wants to see the model rigour underneath.

A few things make the approach distinctive:

- The system is split by subsystem, not simply by algorithm. Doors and bogies each get their own dedicated pipeline built around how that specific subsystem actually tends to fail.
- We don't assume how far ahead a fault is predictable. We measure it, separately for doors and bogies, since different failure modes give warning at very different lead times. **[DATA-DEPENDENT]**
- Everything is compared against a deliberately simple baseline, so we can actually say whether the machine learning earned its place rather than assuming it did.
- Alerts are ranked by real-world urgency, not just statistical probability, and every alert comes with a plain-English reason and an explicit recommended action.
- Every alert an engineer closes captures their verdict, turning the scarcest resource in the whole project, verified fault labels, into something the system generates as it runs.

## Two Views, Because Two Very Different People Use This

A night shift engineer at 3am does not want a precision-recall curve. A judge assessing whether our modelling is sound does not want to scroll past an alert list to find it. So there are two separate views:

- **The Operational View**, built for engineers: one ranked list combining both subsystems, shown as clear priority tiers rather than a false-precision number. Each alert carries its confidence tier, its recommended action (go check it now, log it for the next scheduled visit, or just watch), and where it sits in its lifecycle (seen it yet, getting worse, quietening down, or closed). Nothing statistical appears here.
- **The Diagnostics View**, built for us and for judges: the horizon sweep, the model and baseline comparison, per-fold performance ranges, precision-recall curves, and the data-quality accounting that justifies why the Operational View can be trusted.

This also gives the project a natural way to be demonstrated: the Operational View first, since that's the human story, then Diagnostics, since that's the technical payoff.

## What We're Actually Predicting, and How Far Ahead

This is the foundation everything else rests on, so it's worth being precise.

The fault log gives us the times faults were confirmed. Machine learning needs labels on individual sensor readings. So we label every reading in a window before each confirmed fault as "fault developing", and that window width **is** our prediction horizon: the model answers "is a fault likely within the next N days?", not "is something broken right now?".

**We don't assume that window. We measure it. [DATA-DEPENDENT]** Different equipment gives warning over very different timescales — bearing wear may show signal over weeks, a door mechanism may only give days. So we sweep several candidate horizons (1, 3, 7, 14, 30 days), retrain at each, and report where detection performance actually holds up, separately for doors and bogies. Two constraints bound this: anything shorter than about a day isn't operationally useful, since maintenance realistically happens in scheduled windows rather than instantly, and anything approaching our total data timespan can't be tested properly, since long-horizon training needs far more history before each fault than the horizon itself. Where results between adjacent horizons are ambiguous, we deliberately prefer the shorter one — it's better supported by the data we have and more certain to be actionable.

We're upfront that this sweep is noisy at low fault counts. The output is "where signal appears to hold up in this dataset", not an established predictability limit for railway equipment.

## How the Whole System Works

Door and bogie telemetry, plus a manually verified fault log, form the three inputs. Each can switch out of synthetic mode independently, since one file may arrive before another. Before modelling, we check the data's basic health: fault counts, distinct trains, fault-free stretch, total timespan, and whether the fault log happens to include consequence data, fault-type labels, or depot/location information — several later steps switch on these.

**A data integrity check runs first, and it's deliberately limited in scope.** It catches only unambiguous problems: missing values, sensor dropout, malformed rows, timestamp errors. We considered going further and flagging flat or extreme readings as likely sensor faults, and deliberately pulled back. A flat reading that parses correctly is indistinguishable from a genuine stuck-component fault — a jammed door produces the same signal as a stuck sensor — without physically inspecting the equipment. Excluding such readings would risk deleting the very rare fault examples this project is starved for, and even labelling them "probably sensor noise" risks teaching people to dismiss real signal.

**Before any modelling, we actually look at the data.** Automated checks tell you how many rows and faults you have; they don't tell you a sensor is reporting in the wrong units, has been recalibrated halfway through the dataset, is quietly clipping at a ceiling, or is using a placeholder value that looks like a real reading. So there's a dedicated exploratory step producing plots for a human to read, structured in three levels: each sensor on its own (distributions, missingness, full-timespan plots to reveal step-changes and clipping); sensors against each other and against the target (correlations, and how readings differ in the run-up to a fault versus normal operation); and the overall structure (whether faults occupy any distinguishable region at all, and which sensors are effectively measuring the same thing).

That last level does one thing nothing else in this project does: it checks whether doors and bogies are actually independent. The entire two-pipeline architecture assumes they are. If it turns out both largely track something common like vehicle speed, that assumption is weaker than designed and the fusion weighting deserves a second look — better to find that in an exploratory plot than to never ask.

We're careful about one risk here. Looking at how sensors relate to faults means looking at the labels, and with only dozens of faults a human eye will find *something* that seems to separate them. That impression then quietly steers later choices in a way no amount of careful code structure can undo. So all label-aware exploration runs on training data only, and we note plainly that apparent separation at this sample size is exploratory, not evidence.

**On filling in missing data, we're deliberately conservative.** Short gaps are interpolated, since a hole in the middle of a time series otherwise silently breaks the rolling averages built on top of it. Longer gaps are marked as genuine data outages rather than bridged, because interpolating across a long absence invents a smooth trend over a period where nothing is actually known. Imputation never runs across a fault boundary, which would smear post-fault readings into the pre-fault window used as the label. And only logically impossible values (a negative duration, a timestamp before the dataset began) are treated as missing — never merely unusual ones, for the same reason given above: an anomalous-but-valid reading might be the fault itself, and replacing it with an invented plausible number would delete exactly what we're looking for. Every imputed value is counted and logged, so the volume of it is visible rather than invisible.

**We keep a running tally of how much data survives each filtering step**, so if these filters ever collectively strip away too much of an already-scarce fault count, that's flagged rather than discovered later.

**Everything is measured against a trivial baseline.** Before any machine learning, we build a deliberately simple rule: flag a reading if a single sensor exceeds three standard deviations from normal. It runs through the identical fold structure, alerting logic, and metrics as the full pipeline. If the machine learning doesn't clearly beat it, that's the honest finding and we report it as such. Without this comparison, no claim about ML adding value would be supportable at all.

Rather than one model for the whole train, we train two focused pipelines. Each uses XGBoost, LightGBM, and Random Forest with class weighting so rare faults aren't drowned out. We deliberately avoid SMOTE, since fabricating fault examples risks teaching patterns that never physically occurred.

**We combine models by averaging their rankings, not their raw probabilities.** Random Forest and gradient-boosted models are calibrated quite differently, so averaging raw scores would silently give whichever model has the widest output spread the loudest vote. Ranking sidesteps that entirely.

**Where fault counts allow, we compare models individually first. [DATA-DEPENDENT]** Below a sensible threshold, a detailed comparison would just be comparing noise, so we use the combined model directly and say why. Where a comparison is meaningful, we report every candidate's performance as a range across folds rather than a single averaged number, which communicates our real uncertainty honestly. We considered building formal statistical significance testing on top of this and deliberately didn't: at realistic fault counts it produces wide, unreliable intervals whose outcome is predictable in advance, for a large amount of work. Per-fold ranges say the same thing honestly at a fraction of the cost.

**Validation folds are anchored to actual fault events**, so every fold is guaranteed to be informative, rather than fixed calendar windows that risk being empty. We're explicit about a consequence of this: because test windows are chosen *because* they contain faults, fault density during testing is far higher than in real service, which makes our headline scores structurally optimistic. So alongside the raw figures we report a prevalence-adjusted estimate and a separate false-alarm rate measured on genuinely normal operating periods, and treat those together as the realistic picture.

**We check that our own alerting logic doesn't consume the lead time we're trying to buy.** An alert only fires after a pattern persists across several readings, which takes real time. If that delay eats too much of the prediction horizon, the system structurally cannot fire in time no matter how good the model is. We check this explicitly and shorten the persistence requirement if needed.

**We define precisely what counts as a hit and a false alarm.** One alert opening within a fault's warning window is one true positive, and multiple alerts about the same developing fault count once rather than being punished as extra false alarms. A false alarm is a distinct alert episode, from opening to closure, not counted per reading — so one long-running alert is one false alarm, not hundreds. These rules sound like bookkeeping, but without them the headline numbers wouldn't mean anything specific.

## Respecting Technicians' Time

Every alert has a cost on the other end: a technician's time, and potentially a train pulled from service. If every small anomaly were flagged, technicians would end up checking trains constantly and the system would simply be ignored.

So the fault-catching versus alert-volume trade-off is treated as an adjustable human decision rather than a fixed statistical default. It can be tuned toward fewer, more targeted alerts or toward catching more at the cost of more checks.

**Not every alert means someone walks out to a train.** Each alert carries a recommended action: physical inspection soon, for high-severity issues that can't wait; logging for the next already-scheduled maintenance window, for something real but not urgent; or watch only, no action needed. The model noticing something and a technician being dispatched are deliberately not the same event.

**We report how many alerts per week the tuned system would actually produce**, split by action tier, so that number can be judged against real crew capacity by someone who knows the operation.

**We deliberately don't guess that capacity.** We don't know crew sizes, shift structures, or how long a given repair takes, and inventing those numbers would undermine everything else here. So capacity is an optional input that stays switched off unless someone who actually knows supplies a real figure. Similarly, rather than assuming how long work takes, the system measures it: every alert's lifecycle is timestamped, so once alerts have genuinely been worked through, real handling times become measurable evidence rather than an assumption. In a fresh demo this reports "not yet measurable", which is the honest answer.

**If the data includes depot or location information, we prioritise trains actually reachable tonight**, since an urgent alert on an unavailable train can't be actioned. If that field doesn't exist, we rank by severity alone and say so.

**We watch for any single train dominating the alerts.** If one unit produces most of them, that's more likely a sensor or calibration issue than genuinely worse mechanical health — and engineers will quickly learn to ignore that train, including the one time it matters.

## Alerts, Explanations, and Closing the Loop

An alert opens only after a pattern persists. From there it can be acknowledged (an engineer has seen it — which matters for shift handover), escalated, or downgraded to "quiesced, keep monitoring" if severity drops. Critically, a dropping score never closes an alert on its own. This is a triage tool, not an autopilot, and we hold to that literally: only a human decision closes an alert.

Every alert carries a plain-English explanation generated using SHAP, so an engineer reads "door closing 15% slower than normal, vibration 40% higher" rather than a probability. Where the alert comes from combined models, the explanation is computed across all of them in the same proportion the combination uses, so what's shown always matches what actually triggered the alert.

**When an engineer closes an alert, we capture their verdict**: real fault, false alarm, or inconclusive. These are written out in a format directly reusable as new training labels. Given that verified faults are the scarcest resource in this entire project, a tool that generates new ones every time it's used is worth far more than any modelling refinement.

**Fusion, and an honest word about what it is.** Each subsystem's score is combined and multiplied by an impact weight, so a door fault mid-route outranks a bogie fault that can wait for depot. These weights are a domain-expert operational judgement, not something learned from data — the same way a hospital triage rule isn't validated by a classifier's accuracy. We test the rule against hand-built scenarios to check it ranks things as a domain expert would expect, and show results as broad tiers rather than false-precision decimals. If the real fault log includes genuine consequence data, we additionally check how well our weights track real outcomes as supporting evidence, not a replacement.

Because genuine faults are rare, a small tool can trigger a simulated fault so the system's live reaction can be demonstrated. We also generate a written walkthrough of one real detection — when it fired, how far ahead of the fault, what reason it gave, how it progressed — since one concrete example lands harder than aggregate metrics.

## Explicitly Out of Scope (For Now)

Each was considered and cut, not overlooked:

- **Isolation Forest / novelty detection** — calibrating an unsupervised model against a handful of faults is close to arbitrary.
- **Drift detection** — no value without a retraining process behind it.
- **Cross-subsystem co-occurrence check** — unfalsifiable with so few dual-fault cases.
- **FFT on bogie vibration** — a plain FFT is unlikely to surface bearing signatures without envelope demodulation.
- **Fleet/peer comparison and per-train baseline features** — depend on multi-train data shape we may not have.
- **Per-fault-type prediction horizons** — the right refinement in principle, but splitting dozens of faults by type leaves single-digit examples per category.
- **Bootstrap confidence intervals and significance testing** — wide, unreliable, and near-deterministic in outcome at realistic fault counts; per-fold ranges are the honest, cheap equivalent.
- **Combinatorial Purged Cross-Validation** — only pays off at fault counts far beyond what we expect.
- **Neural sequence models (e.g. LSTMs)** — need considerably more data than we're likely to have.
- **Live/streaming ingestion** — this is an offline pipeline over historical files; live scoring is a separate engineering project.
- **2D/3D carriage visual** — no modelling value.

## Pre-Data Build Plan (Phase 0)

**Buildable now:** both dashboard views, the data integrity check, the three-level exploratory analysis and imputation logic, the labelling and horizon-sweep machinery, the trivial baseline, the fusion rule and its scenario tests, confidence tiers and recommended actions, the full alert lifecycle including verdict capture, SHAP wiring, the replay tool, and the case study generator — all testable on synthetic data with injected degradation ramps.

**Blocked on data, and decided by the data once it arrives [DATA-DEPENDENT]:** the actual prediction horizon per subsystem; how many verified faults, trains, and fault-free stretches exist; whether consequence, fault-type, or depot fields are present; whether a full model comparison is worthwhile; whether early faults can be excluded; whether the normal-period check is possible; and the real models themselves.

## Known Limitations and Path to Production

**Why this isn't production-ready:**

- Real verified faults will likely number in the dozens, so any performance figure is an early signal, not a guarantee.
- Our headline metrics are structurally optimistic because test windows are fault-anchored; the prevalence-adjusted figure and normal-period false-alarm rate are the more realistic view.
- The prediction horizon we select is measured from few examples and may shift substantially with more data.
- Our fusion and impact weights will likely remain a domain-expert assumption unless the fault log includes real consequence data.
- We cannot distinguish a malfunctioning sensor from a genuine stuck-component fault, and deliberately don't try; only physical inspection resolves that.
- The two-pipeline design assumes doors and bogies fail reasonably independently. Our exploratory analysis checks this rather than assuming it, but if real data shows the two are strongly correlated through some common driver, the fusion weighting would need rethinking rather than a small adjustment.
- Our expected-alert-volume estimate comes from available data, not a real crew's capacity or workflow. It needs confirming against real operational feedback.
- Trains change over time as sensors are recalibrated and parts age; we don't include automatic drift detection.
- Confirming an alert was correct requires physical inspection, so validation is slow, and success looks identical to nothing happening.

**What closing that gap would involve:**

1. Treating this build explicitly as a proof of concept.
2. Running the exploratory analysis on real data and genuinely reading it before anything else — it's the step most likely to be skipped and the most costly to skip, since it's the only thing that catches wrong units, clipped sensors, or mid-dataset recalibration.
3. Backtesting on real history, reporting ranges rather than single figures, and re-running the horizon sweep on real faults.
4. Comparing honestly against the trivial baseline and reporting the result either way.
5. Collecting engineer verdicts from day one — the capture mechanism already exists and this is the fastest route out of fault scarcity.
6. Supplying a real crew capacity figure, and reading real handling times off the lifecycle logs once alerts have been worked through.
7. Running in shadow mode before it influences any real decision.
8. Keeping a human in the loop permanently, which the closure design now enforces structurally rather than by intention.
9. Building drift detection and a retraining cadence as a genuine next phase.

The core system — two subsystem pipelines, a measured rather than assumed prediction horizon, honest baseline comparison, event-level evaluation, fusion labelled for what it is, the full alert lifecycle with verdict capture, and the two-view dashboard — is what makes this project complete and defensible on its own. If time is tight, building one subsystem thoroughly, most likely bogies given the richer vibration data, and giving the second a lighter version of the same pipeline still demonstrates the whole idea end to end.
