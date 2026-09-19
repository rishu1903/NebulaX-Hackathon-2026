# Graph Report - frontend  (2026-09-19)

## Corpus Check
- 25 files · ~12,329 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 119 nodes · 232 edges · 16 communities (12 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `280e14af`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Upload and API Workflow|Upload and API Workflow]]
- [[_COMMUNITY_Result View Models|Result View Models]]
- [[_COMMUNITY_Engineering Panels|Engineering Panels]]
- [[_COMMUNITY_Digital Twin Orchestration|Digital Twin Orchestration]]
- [[_COMMUNITY_Shared Condition System|Shared Condition System]]
- [[_COMMUNITY_Door Cycle Diagnostics|Door Cycle Diagnostics]]
- [[_COMMUNITY_UI Utilities|UI Utilities]]
- [[_COMMUNITY_Application Shell|Application Shell]]
- [[_COMMUNITY_Next Configuration|Next Configuration]]
- [[_COMMUNITY_Styling Pipeline|Styling Pipeline]]
- [[_COMMUNITY_Next Type Declarations|Next Type Declarations]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]

## God Nodes (most connected - your core abstractions)
1. `CONDITION_META` - 9 edges
2. `Subsystem` - 6 edges
3. `Condition` - 6 edges
4. `idleCars()` - 6 edges
5. `buildLiveView()` - 6 edges
6. `carCenterFraction()` - 5 edges
7. `CarState` - 5 edges
8. `carLabel()` - 5 edges
9. `base()` - 5 edges
10. `doorView()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Page()` --calls--> `carCenterFraction()`  [EXTRACTED]
  app/page.tsx → components/fault-disruptors/train-twin.tsx
- `Page()` --calls--> `trainStageWidth()`  [EXTRACTED]
  app/page.tsx → components/fault-disruptors/train-twin.tsx
- `PanelAcv()` --calls--> `carLabel()`  [EXTRACTED]
  components/fault-disruptors/panel-acv.tsx → lib/fault-disruptors/data.ts
- `Button()` --calls--> `cn()`  [EXTRACTED]
  components/ui/button.tsx → lib/utils.ts
- `acvView()` --calls--> `carLabel()`  [EXTRACTED]
  lib/fault-disruptors/live.ts → lib/fault-disruptors/data.ts

## Communities (16 total, 4 thin omitted)

### Community 0 - "Upload and API Workflow"
Cohesion: 0.23
Nodes (13): idleCars(), ACV_NOTE, ACV_RISK, acvView(), base(), buildLiveView(), cycleCount(), doorView() (+5 more)

### Community 1 - "Result View Models"
Cohesion: 0.19
Nodes (8): carLabel(), AcvRow, SHM_BANDS, PanelAcv(), PanelTitle(), PanelRail(), damageBandLabel(), PanelShm()

### Community 2 - "Engineering Panels"
Cohesion: 0.24
Nodes (9): ComponentOverlay, DEMO_TRAINS, DemoTrain, SUBSYSTEM_HEADLINES, SUBSYSTEM_PRESENTATION, SubsystemPresentation, SUBSYSTEMS, Header() (+1 more)

### Community 3 - "Digital Twin Orchestration"
Cohesion: 0.25
Nodes (7): Page(), carCenterFraction(), carX(), Props, trainStageWidth(), TrainTwin(), viewWidth()

### Community 4 - "Shared Condition System"
Cohesion: 0.29
Nodes (7): ConditionIcon(), CarState, Condition, CONDITION_META, HoverBubble(), Kpi, KpiStrip()

### Community 5 - "Door Cycle Diagnostics"
Cohesion: 0.2
Nodes (8): analyse(), ApiError, DOWNLOAD_NAME, downloadCsv(), downloadResultsZip(), ROUTE, ZipPrediction, Subsystem

### Community 6 - "UI Utilities"
Cohesion: 0.24
Nodes (9): AnalyseResult, createDashboardWorkspace(), DashboardWorkspace, emptySubsystem(), fileJobId(), JobStatus, loadDashboardWorkspace(), saveDashboardWorkspace() (+1 more)

### Community 7 - "Application Shell"
Cohesion: 0.27
Nodes (5): ANALYSIS_STEPS, SUBSYSTEM_UPLOAD, BatchQueue(), TechnicalDetails(), AnalysisJob

### Community 8 - "Next Configuration"
Cohesion: 0.25
Nodes (5): DoorCycle, FLAG_LABELS, formatMetric(), PanelDoor(), SelectedCycle()

### Community 9 - "Styling Pipeline"
Cohesion: 0.7
Nodes (3): cn(), Button(), buttonVariants

## Knowledge Gaps
- **22 isolated node(s):** `nextConfig`, `config`, `metadata`, `viewport`, `SUBSYSTEM_UPLOAD` (+17 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `idleCars()` connect `Upload and API Workflow` to `Engineering Panels`, `Application Shell`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `CONDITION_META` connect `Shared Condition System` to `Result View Models`, `Engineering Panels`, `Digital Twin Orchestration`, `Application Shell`, `Next Configuration`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `buildLiveView()` connect `Upload and API Workflow` to `Application Shell`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `nextConfig`, `config`, `metadata` to the rest of the system?**
  _22 weakly-connected nodes found - possible documentation gaps or missing edges._