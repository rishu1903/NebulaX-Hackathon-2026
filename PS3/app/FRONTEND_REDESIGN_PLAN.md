# Fault Disruptors Frontend Redesign Plan

## Implementation status — completed locally

Phases 1–3 are implemented in the frontend. The production Next.js build and strict TypeScript check pass, and the FastAPI regression suite reports 21 passing tests. Live upload and Cloud Run verification will be completed after the next Git push and deployment.

Rail and SHM received a second layout pass after live review:

- Rail now converts wheel-pulse transitions into travelled metres, uses that distance on the track ribbon, and groups model verdict, measured context and inspection guidance without repeating the top KPI strip.
- SHM now presents one compact damage gauge, separates model scope from the showcase asset context, collapses the calculation method, and renders front, centre, rear and underframe zones on the showcase carriage.

## Outcome

Turn the current single-file dashboard into a persistent, batch-capable Train Digital Twin that keeps each subsystem's results when users switch views, shows all eight carriages clearly, and separates model findings from showcase-only asset locations.

This plan is based on:

- the deployed dashboard at `https://ps3-api-itd26c3i4q-as.a.run.app/`;
- the Next.js frontend under `PS3/app/frontend`;
- the FastAPI upload contract in `PS3/app/backend/main.py`;
- `frontend_summary_prompt.md` and its “train is the interface” design rule;
- a local Graphify structural scan: 95 nodes, 186 relationships, 11 component communities.

## What the audit found

| Problem | Cause in the current code | Planned correction |
|---|---|---|
| Results disappear when switching subsystem tabs | `switchSubsystem()` calls `resetAnalysis({ keepFile: false })`, clearing the one shared result and file | Store a separate workspace for ACV, Door, Rail and SHM; switching tabs only changes the visible workspace |
| Refreshing loses completed results | All analysis state lived in React `useState` inside `app/page.tsx` | Save serializable completed results, selected train and active subsystem to versioned browser storage |
| Only one file can be selected | The file input lacks `multiple`; change/drop handlers use only `files[0]` | Accept and validate a `File[]`, display a queue, and analyse files with controlled concurrency |
| Only one CSV can be downloaded | `downloadCsv()` creates one browser download from one result | Add “Download all as ZIP”, containing one prediction CSV per successful upload plus a manifest |
| SHM damage has no carriage | The model returns one damage value for the uploaded structural record and has no carriage or zone field | Show a clearly labelled showcase asset context, defaulting to Car 04 / Center Body, while preserving the model scope statement |
| Door result does not identify a physical door | The dataset provides cycle-level telemetry for one unlabelled door | Highlight one fixed showcase door, defaulting to Car 03 / Door 2, labelled “Showcase location — not model output” |
| Eight-car overview is difficult to scan | The SVG is rendered on a roughly 2,000 px stage, forcing horizontal scrolling on normal screens | Fit all eight carriages into the desktop hero; open a larger selected-car detail below or in a floating card |
| Main result is below the fold | Header, disclaimer, task copy and upload controls consume most of the first viewport | Compress the header and put fleet selector, subsystem switcher, verdict and twin into the first viewport |
| Upload actions are duplicated | Header, task area and empty-state panel all offer upload/analysis actions | Use one primary upload button and one contextual drop zone; keep secondary actions quiet |

## Proposed screen hierarchy

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ FAULT DISRUPTORS       Demo Fleet: [T01] [T02] [T03]       Upload files   │
│                         “Showcase selector — no fleet backend”             │
├────────────────────────────────────────────────────────────────────────────┤
│ [DOOR] [ACV] [RAIL] [SHM]        4 files · 3 complete · 1 needs review   │
├────────────────────────────────────────────────────────────────────────────┤
│ Verdict + 3 essential KPIs                                                │
│                                                                            │
│                 COMPLETE 8-CAR DIGITAL TWIN                                │
│          [01][02][03][04][05][06][07][08]                                 │
│             component overlays change by subsystem                         │
│                                                                            │
│ Selected asset bubble / model scope / suggested next check                 │
├────────────────────────────────────────────────────────────────────────────┤
│ Batch files: [file A ✓] [file B ✓] [file C !] [file D …]                 │
│ [Download selected CSV] [Download all results ZIP]                         │
├────────────────────────────────────────────────────────────────────────────┤
│ Contextual evidence panel for the active result                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## 1. Persistent subsystem workspaces

Replace the single shared `result`, `reportFile`, errors and progress values with:

```ts
type AnalysisJob = {
  id: string
  fileName: string
  file?: File
  status: "staged" | "running" | "complete" | "error"
  result?: AnalyseResult
  error?: string
}

type SubsystemWorkspace = {
  jobs: AnalysisJob[]
  activeJobId: string | null
  selectedAssetId: string | null
}

type DashboardState = {
  activeSubsystem: Subsystem
  selectedTrainId: string
  workspaces: Record<Subsystem, SubsystemWorkspace>
}
```

`switchSubsystem()` will only update `activeSubsystem`. It will no longer erase another subsystem’s files or results.

Persist the serializable part of this state under a versioned key such as `fault-disruptors:v1:dashboard`. A completed `AnalyseResult` and its `submission_csv` can be restored after refresh. Browser security prevents reconstructing a raw `File` from storage, so staged-but-not-analysed files will require reselection after a full refresh. The UI must say this plainly.

The implementation uses `localStorage` for completed lightweight results so the workspace also survives a closed tab. Raw pending files are not stored; persisting them would require IndexedDB and a separate data-retention decision.

## 2. Multiple uploads and batch analysis

### Intake

- Add `multiple` to the file input.
- Validate every selected file against the active subsystem extension.
- Deduplicate using `name + size + lastModified`.
- Show accepted and rejected files individually rather than replacing the entire queue.
- Support adding more files after a batch is already complete.

### Processing

- Reuse the existing single-file `/api/analyse/{subsystem}` endpoint.
- Run at most two requests concurrently to avoid overloading the Cloud Run instance.
- Use per-file states so one failure does not cancel successful analyses.
- Keep the API's current 30 MB per-file limit visible near the drop zone.
- Make the newest successful result active, while leaving every previous result selectable.

This approach does not require a new backend batch endpoint and avoids placing many large files into one Cloud Run request.

### Batch UI

Each file chip or row shows:

- filename;
- queued/running/complete/error status;
- short prediction;
- select-result action;
- retry or remove action.

The train, verdict and evidence panel always represent the currently selected completed file.

## 3. Combined ZIP download

Add a small browser ZIP library such as `fflate`. Generate the archive locally so prediction data is not uploaded to another service.

Archive structure:

```text
fault-disruptors-rail-results.zip
├── predictions/
│   ├── Test01_predictions.csv
│   ├── Test02_predictions.csv
│   └── Test03_predictions.csv
└── manifest.json
```

`manifest.json` records subsystem, original filename, output filename, success/error status and prediction summary. Failed jobs are listed but do not receive a fabricated CSV. Filenames must be sanitized and made unique.

Keep “Download selected CSV” for quick use and add “Download all results ZIP” once two or more successful results exist.

## 4. Train number showcase bar

Add a compact fleet selector immediately below or inside the header:

```text
DEMO FLEET  [ Train T01 ] [ Train T02 ] [ Train T03 ]
             Showcase selector · no fleet data connection
```

The selector changes the train identifier, display accent and stored workspace context only. It does not change model inference or pretend that uploaded telemetry belongs to a real fleet asset. The selected train persists across subsystem changes and refreshes.

Recommended demo records:

| Train | Display purpose |
|---|---|
| T01 | Default mixed-condition showcase |
| T02 | Mostly normal example |
| T03 | Review-heavy example |

## 5. Component and carriage highlighting

Extend `CarState` with optional component overlays:

```ts
type ComponentOverlay = {
  id: string
  kind: "door" | "cooling" | "structure" | "bogie"
  condition: Condition
  label: string
  source: "model" | "showcase"
}
```

### ACV

Keep the existing model-derived carriage ranking. The top carriage remains red, the second priority amber, and the rest normal or neutral. This is already grounded in the API table.

### Door

Use Car 03 / Door 2 as a fixed presentation location when an abnormal cycle exists. Colour only that door red; do not colour the complete carriage. The hover bubble must say:

> Showcase location: Car 03 · Door 2. The uploaded dataset represents one unlabelled door; this position is for interface demonstration only.

Normal uploads keep every door green or neutral. The cycle timeline remains the actual model evidence.

### Rail

Continue highlighting Side I or Side II on the rail bed. Do not assign rail corrugation to a carriage. The recording-wide scope remains explicit.

### SHM

Use Car 04 / Center Body as the default showcase asset context for elevated damage. Add a translucent structural-zone overlay to the selected carriage. The result card must separate:

- **Model result:** cumulative fatigue damage for the uploaded record;
- **Showcase asset context:** Car 04 / Center Body, not localised by the model.

This gives the visual demonstration requested without presenting invented localization as an engineering conclusion.

## 6. Digital Twin visual changes

- Fit all eight cars within a standard desktop-width hero so the complete consist is visible at once.
- Keep horizontal scrolling only for narrow mobile screens.
- Increase the selected carriage with a focused detail strip rather than enlarging the whole consist.
- Pass the active subsystem into each car so Door and SHM can render component-specific overlays.
- Replace whole-car red tint for component faults with localized door/zone colour.
- Make locked selection visually distinct from hover.
- Add an always-visible legend for Model, Showcase and No Location Available.
- Remove the pulsing red dot in Rail mode when the result is normal.
- Respect reduced-motion preferences for carriage lift and rail transitions.

## 7. First-viewport simplification

- Reduce header height and shorten the permanent safety statement to an info tooltip plus footer note.
- Keep one upload action in the header and the drag/drop area in the empty state.
- Place the subsystem tabs directly above the twin.
- Show at most four KPIs: active file, model verdict, primary location/scope and confidence/quality state.
- Move long explanations and technical details below the twin.
- Show batch progress as one compact strip instead of replacing the whole page with loading copy.

## 8. File-by-file implementation map

| File | Change |
|---|---|
| `frontend/app/page.tsx` | Replace single-file state with subsystem workspaces; add persistence, batch queue and active-result selection |
| `frontend/lib/fault-disruptors/api.ts` | Add `analyseMany`, safe output naming and ZIP download helpers |
| `frontend/lib/fault-disruptors/data.ts` | Add demo train records and component overlay types |
| `frontend/lib/fault-disruptors/live.ts` | Produce model vs showcase overlays and truthful scope labels |
| `frontend/components/fault-disruptors/header.tsx` | Add train selector and compact the header |
| `frontend/components/fault-disruptors/train-twin.tsx` | Fit eight cars, render individual door and SHM zone overlays, add source legend |
| `frontend/components/fault-disruptors/batch-queue.tsx` | New file list, statuses, selection, retry and remove controls |
| `frontend/components/fault-disruptors/train-selector.tsx` | New showcase train-number bar |
| `frontend/components/fault-disruptors/result-actions.tsx` | New selected CSV and combined ZIP actions |
| `frontend/components/fault-disruptors/panel-door.tsx` | Link selected abnormal cycle to the showcase door overlay |
| `frontend/components/fault-disruptors/panel-shm.tsx` | Split model output from showcase asset context |
| `frontend/app/globals.css` | Add compact layout, full-consist breakpoints, overlay and batch-state styles |
| `frontend/package.json` | Add the chosen local ZIP dependency |

No backend change is required for the initial batch implementation. The existing stateless endpoint can process each file independently.

## 9. Implementation sequence

### Phase 1 — State and batch foundation

1. Introduce typed dashboard/workspace state.
2. Preserve subsystem results when switching tabs.
3. Add versioned browser-storage restoration.
4. Add multi-file intake, validation and two-request concurrency.
5. Add active-result selection.

### Phase 2 — Export workflow

1. Add collision-safe per-file CSV naming.
2. Add combined ZIP and manifest generation.
3. Show partial-success behavior clearly.

### Phase 3 — Train-first visualization

1. Fit the full consist in the hero.
2. Add the showcase fleet selector.
3. Add model/showcase component overlays.
4. Implement Door 2 and SHM Center Body showcase locations with explicit labels.
5. Connect batch result selection to the twin and evidence panel.

### Phase 4 — Polish and verification

1. Test state restoration across every subsystem switch and browser refresh.
2. Test mixed valid/invalid batches and duplicate filenames.
3. Verify ZIP contents and CSV text byte-for-byte.
4. Check desktop, tablet and narrow-screen layouts.
5. Check keyboard navigation, visible focus, screen-reader labels and reduced motion.
6. Run the Next.js production build and FastAPI tests.

## Acceptance criteria

- Switching ACV → Door → ACV restores the previous ACV queue, selected result, train highlight and evidence panel.
- Refreshing the page restores completed results and the selected train/subsystem in the same browser.
- Users can select or drop multiple valid files and see independent status for each one.
- One failed file does not remove or invalidate successful results.
- A combined ZIP contains every successful prediction CSV and a manifest describing successes and failures.
- ACV carriage highlights come from model output.
- Door and SHM demo locations are visually obvious and always labelled as showcase-only.
- Rail results highlight the affected rail side without inventing carriage localization.
- All eight cars are visible together on a common desktop screen.
- The primary verdict and affected subsystem/component can be understood within three seconds.

## Recommended first implementation boundary

Complete Phases 1–3 in one branch, then deploy a preview for visual review. Leave historical trend charts, real fleet integration, user accounts and work-order dispatch outside this change because the current datasets and API do not support those claims.
