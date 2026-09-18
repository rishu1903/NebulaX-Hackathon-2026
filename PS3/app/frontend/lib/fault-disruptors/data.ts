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

export const CAR_COUNT = 8

/** Per-car condition + finding, keyed by subsystem. Demo data grounded in the product brief. */
export type CarState = {
  id: number
  label: string
  condition: Condition
  rank?: number
  finding: string
  affectedDoors?: number[]
}

type SubsystemView = {
  cars: CarState[]
  headline: string
  verdict: { condition: Condition; text: string }
}

const neutralCars = (finding: string): CarState[] =>
  Array.from({ length: CAR_COUNT }, (_, i) => ({
    id: i + 1,
    label: `Car ${String(i + 1).padStart(2, "0")}`,
    condition: "neutral" as Condition,
    finding,
  }))

function build(overrides: Partial<Record<number, Partial<CarState>>>, base: CarState[]): CarState[] {
  return base.map((c) => (overrides[c.id] ? { ...c, ...overrides[c.id] } : c))
}

const ACV_BASE = neutralCars("Cooling nominal — no refrigerant anomaly").map((c) => ({
  ...c,
  condition: "normal" as Condition,
  finding: "Cooling nominal — no refrigerant anomaly",
}))

const DOOR_BASE = neutralCars("Door cycles within normal resistance band").map((c) => ({
  ...c,
  condition: "normal" as Condition,
  finding: "Door cycles within normal resistance band",
}))

const SHM_BASE = neutralCars("Structural strain within design envelope").map((c) => ({
  ...c,
  condition: "normal" as Condition,
  finding: "Structural strain within design envelope",
}))

export const SUBSYSTEM_DATA: Record<Subsystem, SubsystemView> = {
  ACV: {
    headline: "Refrigerant leak ranking across the consist",
    verdict: { condition: "issue", text: "Car 03 — Suspected refrigerant leakage (Priority #1)" },
    cars: build(
      {
        3: { condition: "issue", rank: 1, finding: "Suspected refrigerant leakage detected" },
        6: { condition: "review", rank: 2, finding: "Cooling efficiency drift — review recommended" },
        2: { condition: "review", rank: 3, finding: "Minor pressure variance — monitor" },
      },
      ACV_BASE,
    ),
  },
  DOOR: {
    headline: "Saloon door cycle diagnostics",
    verdict: { condition: "issue", text: "Car 04 — Abnormal closing resistance across 3 cycles" },
    cars: build(
      {
        4: {
          condition: "issue",
          rank: 1,
          finding: "Abnormal closing resistance across 3 cycles",
          affectedDoors: [2, 3],
        },
        5: { condition: "review", rank: 2, finding: "Elevated cycle duration — review", affectedDoors: [1] },
      },
      DOOR_BASE,
    ),
  },
  RAIL: {
    headline: "1-second track ribbon — corrugation scan",
    verdict: { condition: "issue", text: "Side I corrugation detected over 18.07 m traversed" },
    cars: neutralCars("Rail scan aggregated at consist level"),
  },
  SHM: {
    headline: "Structural health digital twin",
    verdict: { condition: "issue", text: "Car 05 — Center Body fatigue signature detected" },
    cars: build(
      {
        5: { condition: "issue", rank: 1, finding: "Center Body fatigue signature detected" },
        4: { condition: "review", rank: 2, finding: "Underframe strain elevated — review" },
      },
      SHM_BASE,
    ),
  },
}

/* ---------- ACV ranking bar ---------- */
export const ACV_RANKING = [
  { car: "Car 03", value: 100, rank: 1, note: "Inspect First", condition: "issue" as Condition },
  { car: "Car 06", value: 58, rank: 2, note: "Review", condition: "review" as Condition },
  { car: "Car 02", value: 34, rank: 3, note: "Monitor", condition: "review" as Condition },
  { car: "Car 01", value: 12, rank: 4, note: "Nominal", condition: "normal" as Condition },
]

/* ---------- DOOR cycle timeline ---------- */
export type DoorCycle = {
  index: number
  condition: Condition
  durationMs: number
  resistance: string
}
export const DOOR_CYCLES: DoorCycle[] = Array.from({ length: 38 }, (_, i) => {
  const index = i + 1
  let condition: Condition = "normal"
  if ([17, 18, 19].includes(index)) condition = "issue"
  else if ([24, 30].includes(index)) condition = "review"
  return {
    index,
    condition,
    durationMs: condition === "issue" ? 4200 + i * 12 : condition === "review" ? 3600 : 3100 + (i % 5) * 20,
    resistance: condition === "issue" ? "High (2.4Ω)" : condition === "review" ? "Elevated (1.7Ω)" : "Nominal (1.1Ω)",
  }
})

/* ---------- RAIL KPIs + charts ---------- */
export const RAIL_KPIS = [
  { label: "Active File", value: "Test24.csv", condition: "neutral" as Condition },
  { label: "Traversed Distance", value: "18.07 m", condition: "neutral" as Condition },
  { label: "Mean Speed", value: "64.8 km/h", condition: "neutral" as Condition },
  { label: "Verdict", value: "Side I Corrugation", condition: "issue" as Condition },
]

// Vibration envelope — Ch1 & Ch2 acceleration (m/s^2) over 1000 ms window
export const RAIL_VIBRATION = Array.from({ length: 60 }, (_, i) => {
  const t = Math.round((i / 59) * 1000)
  const base = Math.sin(i / 3) * 1.2
  const corrugation = i > 20 && i < 46 ? Math.sin(i * 1.9) * 3.4 : Math.sin(i * 1.9) * 0.8
  return {
    t,
    ch1: Number((base + corrugation).toFixed(2)),
    ch2: Number((base * 0.7 + corrugation * 0.5 + 0.6).toFixed(2)),
    rms: Number((Math.abs(corrugation) * 0.6 + 1.1).toFixed(2)),
  }
})
export const RAIL_ISO_THRESHOLD = 3.2

// Instantaneous speed tachograph — Ch0 speed (km/h)
export const RAIL_SPEED = Array.from({ length: 60 }, (_, i) => {
  const t = Math.round((i / 59) * 1000)
  return { t, speed: Number((62 + Math.sin(i / 8) * 3.5 + (i > 40 ? 2 : 0)).toFixed(1)) }
})

// FFT power spectrum — characteristic ~340 Hz corrugation peak
export const RAIL_SPECTRUM = Array.from({ length: 64 }, (_, i) => {
  const hz = Math.round((i / 63) * 600)
  const peak = Math.exp(-Math.pow((hz - 340) / 40, 2)) * 100
  const floor = Math.max(0, 18 - i * 0.15) + Math.random() * 4
  return { hz, power: Number((peak + floor).toFixed(1)) }
})

/* ---------- SHM structural zones ---------- */
export type ShmZone = {
  id: string
  label: string
  condition: Condition
  finding: string
}
export const SHM_ZONES: ShmZone[] = [
  { id: "roof", label: "Roof", condition: "normal", finding: "Strain nominal" },
  { id: "front", label: "Front Body", condition: "normal", finding: "Strain nominal" },
  { id: "center", label: "Center Body", condition: "issue", finding: "Fatigue signature — cyclic strain exceeds envelope" },
  { id: "rear", label: "Rear Body", condition: "normal", finding: "Strain nominal" },
  { id: "underframe", label: "Underframe", condition: "review", finding: "Elevated strain — review recommended" },
  { id: "bogie", label: "Bogie Area", condition: "normal", finding: "Vibration within band" },
]
