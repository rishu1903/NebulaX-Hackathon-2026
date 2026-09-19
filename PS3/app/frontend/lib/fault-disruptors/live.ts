import type { Kpi } from "@/components/fault-disruptors/kpi-strip"
import type { AnalyseResult } from "@/lib/fault-disruptors/api"
import { carLabel, idleCars, type CarState, type Condition, type Subsystem } from "@/lib/fault-disruptors/data"

/* ------------------------------------------------------------------ */
/* View model: what the page renders once a real result has arrived.   */
/* Everything here is derived from the API response; nothing is mocked. */
/* ------------------------------------------------------------------ */

export type AcvRow = {
  rank: number
  car: string
  score: number | null
  condition: Condition
  note: string
  /** Bar length, 0-100, relative to the highest score. */
  value: number
}

export type DoorCycle = {
  index: number
  date: string
  start: string
  end: string
  label: string
  operation: string
  ratio: number
  threshold: number
  margin: number
  confidence: string
  flags: string[]
  condition: Condition
}

export type Panel =
  | { kind: "acv"; rows: AcvRow[]; margin: number | null; emptyCars: string[] }
  | { kind: "door"; cycles: DoorCycle[]; abnormal: number; review: number }
  | { kind: "rail"; label: string; side: "I" | "II" | null; speedKmh: number | null; speedChanges: number | null; lowMotion: boolean }
  | { kind: "shm"; damage: number; condition: Condition }

export type LiveView = {
  headline: string
  verdict: { condition: Condition; text: string }
  cars: CarState[]
  kpis: Kpi[]
  railSide: "I" | "II" | null
  panel: Panel
  technical: Record<string, unknown>
  hasCsv: boolean
}

export function buildLiveView(subsystem: Subsystem, result: AnalyseResult): LiveView {
  switch (subsystem) {
    case "ACV":
      return acvView(result)
    case "DOOR":
      return doorView(result)
    case "RAIL":
      return railView(result)
    case "SHM":
      return shmView(result)
  }
}

const base = (result: AnalyseResult) => ({
  technical: result.technical_details ?? {},
  hasCsv: Boolean(result.submission_csv),
})

/* ------------------------------ ACV ------------------------------ */

const ACV_RISK: Record<string, Condition> = { red: "issue", yellow: "review", green: "normal", "no data": "neutral" }
const ACV_NOTE: Record<Condition, string> = {
  issue: "High deviation",
  review: "Review",
  normal: "Nominal",
  neutral: "No data",
}

function acvView(result: AnalyseResult): LiveView {
  const table = result.table ?? []
  const scores = table.map((r) => (typeof r.score === "number" ? r.score : null))
  const maxScore = Math.max(0, ...scores.filter((s): s is number => s !== null))

  const rows: AcvRow[] = table.map((r) => {
    const top = r.rank === 1
    const condition: Condition = top ? "issue" : (ACV_RISK[r.risk] ?? "neutral")
    const score: number | null = typeof r.score === "number" ? r.score : null
    let value = 0
    if (score !== null && maxScore > 0) value = Math.max(score > 0 ? 3 : 0, (Math.max(0, score) / maxScore) * 100)
    return {
      rank: r.rank,
      car: String(r.car),
      score,
      condition,
      note: top ? "Inspect first" : ACV_NOTE[condition],
      value,
    }
  })

  const cars: CarState[] = rows
    .map((row, i) => {
      const id = Number.parseInt(row.car, 10)
      const scoreText = row.score === null ? "" : ` (score ${row.score >= 0 ? "+" : ""}${row.score.toFixed(3)})`
      const finding =
        row.rank === 1
          ? `Most likely refrigerant leak — inspect first${scoreText}`
          : row.condition === "issue" || row.condition === "review"
            ? `Cooling deviation above the healthy range — review${scoreText}`
            : row.condition === "neutral"
              ? "No usable sensor data for this car"
              : `Cooling within the normal range${scoreText}`
      return {
        id: Number.isNaN(id) ? i + 1 : id,
        label: carLabel(row.car),
        condition: row.condition,
        rank: row.rank,
        finding,
      }
    })
    .sort((a, b) => a.id - b.id)

  const top = rows.find((r) => r.rank === 1)
  const reviewCars = rows.filter((r) => r.rank !== 1 && (r.condition === "review" || r.condition === "issue"))

  return {
    headline: "Refrigerant leak ranking across the consist",
    verdict: {
      condition: top ? "issue" : "neutral",
      text: top ? `${carLabel(top.car)} — Most likely refrigerant leak (Priority #1)` : "No cars could be ranked",
    },
    cars,
    kpis: [
      { label: "Consist", value: `${rows.length} Cars`, condition: "neutral" },
      { label: "Flagged", value: top ? carLabel(top.car) : "—", condition: top ? "issue" : "neutral" },
      {
        label: "Under Review",
        value: reviewCars.length ? reviewCars.map((r) => carLabel(r.car)).join(", ") : "None",
        condition: reviewCars.length ? "review" : "neutral",
      },
      { label: "Verdict", value: "Refrigerant Leak", condition: top ? "issue" : "neutral" },
    ],
    railSide: null,
    panel: {
      kind: "acv",
      rows,
      margin: typeof result.summary?.margin === "number" ? result.summary.margin : null,
      emptyCars: result.summary?.empty_cars ?? [],
    },
    ...base(result),
  }
}

/* ------------------------------ Door ----------------------------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** The dataset's native timestamp `Y-M-D-H-m-s-ms` (not zero-padded) -> readable date and time. */
export function formatNativeTime(stamp: string): { date: string; time: string } {
  const parts = String(stamp).split("-").map(Number)
  if (parts.length !== 7 || parts.some(Number.isNaN)) return { date: "", time: String(stamp) }
  const [y, mo, d, h, mi, s, ms] = parts
  const p = (n: number, w = 2) => String(n).padStart(w, "0")
  return { date: `${d} ${MONTHS[mo - 1] ?? mo} ${y}`, time: `${p(h)}:${p(mi)}:${p(s)}.${p(ms, 3)}` }
}

const cycleCount = (n: number) => `${n} ${n === 1 ? "Cycle" : "Cycles"}`

function doorView(result: AnalyseResult): LiveView {
  const cycles: DoorCycle[] = (result.table ?? []).map((r, i) => {
    const start = formatNativeTime(r.start_time)
    const end = formatNativeTime(r.end_time)
    const flags = String(r.quality_flags ?? "")
      .split(";")
      .filter(Boolean)
    const abnormal = r.prediction === "Abnormal resistance"
    const lowConfidence = String(r.confidence ?? "").startsWith("Low") || flags.length > 0
    return {
      index: i + 1,
      date: start.date,
      start: start.time,
      end: end.time,
      label: String(r.prediction),
      operation: String(r.operation ?? ""),
      ratio: Number(r.resistance_ratio),
      threshold: Number(r.threshold),
      margin: Number(r.margin_to_threshold),
      confidence: String(r.confidence ?? ""),
      flags,
      condition: abnormal ? "issue" : lowConfidence ? "review" : "normal",
    }
  })

  const total = cycles.length
  const abnormal = cycles.filter((c) => c.condition === "issue").length
  const review = cycles.filter((c) => c.condition === "review").length

  return {
    headline: "Saloon door cycle diagnostics",
    verdict: {
      condition: abnormal > 0 ? "issue" : "normal",
      text:
        abnormal > 0
          ? `${abnormal} of ${total} door cycles show abnormal resistance`
          : `All ${total} door cycles are within the normal resistance range`,
    },
    // Door telemetry is one door's continuous stream; it carries no car identifier, so the
    // train stays neutral and the findings are shown per cycle.
    cars: idleCars().map((c) => ({ ...c, finding: "Door results are reported per cycle, not per car" })),
    kpis: [
      { label: "Cycles Evaluated", value: String(total), condition: "neutral" },
      { label: "Abnormal", value: cycleCount(abnormal), condition: abnormal > 0 ? "issue" : "normal" },
      { label: "Review", value: cycleCount(review), condition: review > 0 ? "review" : "neutral" },
      {
        label: "Verdict",
        value: abnormal > 0 ? "Abnormal Resistance" : "Normal",
        condition: abnormal > 0 ? "issue" : "normal",
      },
    ],
    railSide: null,
    panel: { kind: "door", cycles, abnormal, review },
    ...base(result),
  }
}

/* ------------------------------ Rail ----------------------------- */

function railView(result: AnalyseResult): LiveView {
  const label = String(result.prediction ?? "")
  const side = label === "Side I" ? "I" : label === "Side II" ? "II" : null
  const damaged = side !== null
  const speed = typeof result.summary?.speed_kmh === "number" ? result.summary.speed_kmh : null
  const changes = typeof result.summary?.speed_transitions === "number" ? result.summary.speed_transitions : null

  return {
    headline: "Rail corrugation scan",
    verdict: {
      condition: damaged ? "issue" : "normal",
      text: damaged ? `${label} corrugation detected` : "No rail corrugation detected",
    },
    cars: idleCars().map((c) => ({ ...c, finding: "Rail scan is reported for the whole consist" })),
    kpis: [
      { label: "Active File", value: result.filename, condition: "neutral" },
      { label: "Mean Speed", value: speed === null ? "—" : `${speed.toFixed(1)} km/h`, condition: "neutral" },
      { label: "Speed Changes", value: changes === null ? "—" : String(changes), condition: "neutral" },
      { label: "Verdict", value: damaged ? `${label} Corrugation` : "Normal", condition: damaged ? "issue" : "normal" },
    ],
    railSide: side,
    panel: {
      kind: "rail",
      label,
      side,
      speedKmh: speed,
      speedChanges: changes,
      lowMotion: Boolean(result.summary?.low_transition_override),
    },
    ...base(result),
  }
}

/* ------------------------------- SHM ----------------------------- */

/**
 * Miner's rule: damage D >= 1 means fatigue failure. These bands are a UI convention for how
 * close a record is to that limit, not part of the model.
 */
export const SHM_BANDS = { review: 0.5, issue: 0.8 }

function shmView(result: AnalyseResult): LiveView {
  const damage = Number(result.prediction)
  const valid = Number.isFinite(damage)
  const condition: Condition = !valid
    ? "neutral"
    : damage >= SHM_BANDS.issue
      ? "issue"
      : damage >= SHM_BANDS.review
        ? "review"
        : "normal"
  const pct = valid ? `${(damage * 100).toFixed(1)}%` : "—"

  return {
    headline: "Structural fatigue assessment",
    verdict: {
      condition,
      text: valid
        ? `Cumulative fatigue damage D = ${damage.toFixed(3)} (${pct} of fatigue life)`
        : "No damage value could be computed",
    },
    cars: idleCars().map((c) => ({ ...c, finding: "Fatigue damage is reported for the measured record" })),
    kpis: [
      { label: "Record", value: result.filename, condition: "neutral" },
      { label: "Damage Index D", value: valid ? damage.toFixed(3) : "—", condition },
      { label: "Fatigue Life Used", value: pct, condition },
      {
        label: "Verdict",
        value: condition === "issue" ? "Near Limit" : condition === "review" ? "Elevated" : "Within Limits",
        condition,
      },
    ],
    railSide: null,
    panel: { kind: "shm", damage: valid ? damage : 0, condition },
    ...base(result),
  }
}
