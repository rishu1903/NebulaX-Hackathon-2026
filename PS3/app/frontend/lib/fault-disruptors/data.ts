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

/** Number of carriages shown on the idle train before a file has been analysed. */
export const IDLE_CAR_COUNT = 8

export type CarState = {
  id: number
  label: string
  condition: Condition
  rank?: number
  finding: string
}

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
