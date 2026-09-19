export type Subsystem = "ACV" | "DOOR" | "RAIL" | "SHM"

export type Condition = "normal" | "review" | "issue" | "neutral"

export const CONDITION_META: Record<
  Condition,
  { label: string; icon: string; color: string; soft: string }
> = {
  normal: { label: "NORMAL", icon: "✓", color: "var(--normal)", soft: "var(--normal-soft)" },
  review: { label: "REVIEW", icon: "▲", color: "var(--review)", soft: "var(--review-soft)" },
  issue: { label: "ISSUE", icon: "⚠", color: "var(--issue)", soft: "var(--issue-soft)" },
  neutral: { label: "IDLE", icon: "•", color: "var(--neutral)", soft: "var(--neutral-soft)" },
}

export const SUBSYSTEMS: { id: Subsystem; label: string; full: string }[] = [
  { id: "DOOR", label: "DOOR", full: "Saloon Door Cycles" },
  { id: "ACV", label: "ACV", full: "Carriage Cooling" },
  { id: "RAIL", label: "RAIL", full: "Rail Corrugation" },
  { id: "SHM", label: "SHM", full: "Structural Health" },
]

export type SubsystemPresentation = {
  title: string
  question: string
  idleHint: string
  uploadTitle: string
  uploadHint: string
  twinLabel: string
  twinIdleHint: string
  twinHint: string
  evidenceLabel: string
}

export const SUBSYSTEM_PRESENTATION: Record<Subsystem, SubsystemPresentation> = {
  ACV: {
    title: "Refrigerant Leak Localisation",
    question: "Which carriage is most likely to have a refrigerant leak?",
    idleHint: "Upload the ACV telemetry workbook to rank all 8 carriages by leak likelihood.",
    uploadTitle: "Upload ACV telemetry workbook",
    uploadHint: "Use the .xlsx telemetry workbook containing measurements for all 8 carriages.",
    twinLabel: "8-Car Cooling Overview",
    twinIdleHint: "All 8 carriages remain neutral until the telemetry has been analysed.",
    twinHint: "Carriage colours and rank markers show the inspection priority returned by the model.",
    evidenceLabel: "Leak Ranking and Diagnostic Evidence",
  },
  DOOR: {
    title: "Door Resistance Detection",
    question: "Which door cycles show abnormal resistance?",
    idleHint: "Upload the continuous door telemetry file to detect and classify each operating cycle.",
    uploadTitle: "Upload door telemetry",
    uploadHint: "Use the .csv telemetry file containing the continuous door operating signal.",
    twinLabel: "8-Car Door System Context",
    twinIdleHint: "The train remains neutral because this analysis reports individual door cycles rather than a carriage location.",
    twinHint: "Door findings are reported by operating cycle, so the train remains neutral while the cycle results are shown below.",
    evidenceLabel: "Door Cycle Detection and Classification",
  },
  RAIL: {
    title: "Rail Corrugation Classification",
    question: "Which rail side shows evidence of corrugation?",
    idleHint: "Upload the rail sensor recording to classify the measured window as Normal, Side I or Side II.",
    uploadTitle: "Upload rail sensor recording",
    uploadHint: "Use the .csv recording containing the rail speed, vibration and shock signals.",
    twinLabel: "Rail-Side Inspection View",
    twinIdleHint: "After analysis, the rail view will show whether the uploaded recording is classified as Normal, Side I or Side II.",
    twinHint: "The highlighted rail reflects the model classification for the uploaded recording window.",
    evidenceLabel: "Rail Condition Evidence",
  },
  SHM: {
    title: "Structural Fatigue Assessment",
    question: "What is the predicted cumulative fatigue damage for this structural signal?",
    idleHint: "Upload the structural measurement file to estimate cumulative fatigue damage.",
    uploadTitle: "Upload structural signal",
    uploadHint: "Use the .csv structural measurement file to estimate cumulative fatigue damage.",
    twinLabel: "8-Car Structural Context",
    twinIdleHint: "The train provides system context; the fatigue prediction applies to the uploaded structural record.",
    twinHint: "The train provides system context while the fatigue result is reported for the uploaded structural record.",
    evidenceLabel: "Cumulative Fatigue Damage Assessment",
  },
}

/** Number of carriages shown on the idle train before a file has been analysed. */
export const IDLE_CAR_COUNT = 8

export type CarState = {
  id: number
  label: string
  condition: Condition
  rank?: number
  finding: string
  overlay?: ComponentOverlay
}

export type ComponentOverlay = {
  kind: "door" | "structure"
  condition: Exclude<Condition, "neutral">
  label: string
  /** One-based door number when kind is door. */
  componentIndex?: number
  source: "showcase"
}

export const DEMO_TRAINS = ["T01", "T02", "T03"] as const
export type DemoTrain = (typeof DEMO_TRAINS)[number]

export const carLabel = (id: number | string) => `Car ${String(id).padStart(2, "0")}`

/** Neutral placeholder consist shown before analysis (no results implied). */
export function idleCars(count: number = IDLE_CAR_COUNT): CarState[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    label: carLabel(i + 1),
    condition: "neutral" as Condition,
    finding: "Awaiting analysis",
  }))
}

/** What the page says before any file has been analysed. */
export const SUBSYSTEM_HEADLINES: Record<Subsystem, string> = {
  ACV: "Refrigerant leak ranking across the consist",
  DOOR: "Saloon door cycle diagnostics",
  RAIL: "Rail corrugation scan",
  SHM: "Structural fatigue assessment",
}
