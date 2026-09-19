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
  /** Bar length, 0-100, normalized within this uploaded consist. */
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
  | {
      kind: "rail"
      label: string
      side: "I" | "II" | null
      speedKmh: number | null
      speedChanges: number | null
      lowMotion: boolean
    }
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

const ACV_RISK: Record<string, Condition> = {
  red: "issue",
  yellow: "review",
  green: "normal",
  "no data": "neutral",
}

const ACV_NOTE: Record<Condition, string> = {
  issue: "Elevated",
  review: "Review",
  normal: "Lower priority",
  neutral: "No data",
}

function acvView(result: AnalyseResult): LiveView {
  const table = result.table ?? []
  const numericScores = table
    .map((row) => (typeof row.score === "number" ? row.score : null))
    .filter((score): score is number => score !== null)

  const minScore = numericScores.length ? Math.min(...numericScores) : 0
  const maxScore = numericScores.length ? Math.max(...numericScores) : 0
  const scoreRange = maxScore - minScore

  const rows: AcvRow[] = table.map((row) => {
    const top = row.rank === 1
    const condition: Condition = top ? "issue" : (ACV_RISK[row.risk] ?? "neutral")
    const score: number | null = typeof row.score === "number" ? row.score : null

    let value = 0
    if (score !== null) {
      value = scoreRange > 0 ? 18 + ((score - minScore) / scoreRange) * 82 : 60
    }

    return {
      rank: row.rank,
      car: String(row.car),
      score,
      condition,
      note: top ? "Inspect first" : ACV_NOTE[condition],
      value,
    }
  })

  const cars: CarState[] = rows
    .map((row, index) => {
      const id = Number.parseInt(row.car, 10)
      const scoreText =
        row.score === null ? "" : ` Model score: ${row.score >= 0 ? "+" : ""}${row.score.toFixed(3)}.`

      const finding =
        row.rank === 1
          ? `Highest refrigerant-leak suspicion score in this consist. Inspect this carriage first.${scoreText}`
          : row.condition === "issue" || row.condition === "review"
            ? `Elevated cooling deviation compared with lower-ranked carriages.${scoreText}`
            : row.condition === "neutral"
              ? "No usable sensor score was available for this carriage."
              : `Lower refrigerant-leak suspicion score in this uploaded case.${scoreText}`

      return {
        id: Number.isNaN(id) ? index + 1 : id,
        label: carLabel(row.car),
        condition: row.condition,
        rank: row.rank,
        finding,
      }
    })
    .sort((a, b) => a.id - b.id)

  const ranked = [...rows].sort((a, b) => a.rank - b.rank)
  const top = ranked[0]
  const second = ranked[1]
  const reviewCount = rows.filter(
    (row) => row.rank !== 1 && (row.condition === "review" || row.condition === "issue"),
  ).length

  return {
    headline: "Refrigerant leak inspection priority",
    verdict: {
      condition: top ? "issue" : "neutral",
      text: top
        ? `${carLabel(top.car)} has the highest refrigerant-leak suspicion score`
        : "No carriages could be ranked from this upload",
    },
    cars,
    kpis: [
      { label: "Cars Ranked", value: String(rows.length), condition: "neutral" },
      {
        label: "Inspect First",
        value: top ? carLabel(top.car) : "—",
        condition: top ? "issue" : "neutral",
      },
      {
        label: "Second Priority",
        value: second ? carLabel(second.car) : "—",
        condition: second ? "review" : "neutral",
      },
      {
        label: "Additional Review",
        value: reviewCount > 0 ? `${reviewCount} ${reviewCount === 1 ? "Car" : "Cars"}` : "None",
        condition: reviewCount > 0 ? "review" : "normal",
      },
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
  return {
    date: `${d} ${MONTHS[mo - 1] ?? mo} ${y}`,
    time: `${p(h)}:${p(mi)}:${p(s)}.${p(ms, 3)}`,
  }
}

const cycleCount = (n: number) => `${n} ${n === 1 ? "Cycle" : "Cycles"}`

function doorView(result: AnalyseResult): LiveView {
  const cycles: DoorCycle[] = (result.table ?? []).map((row, index) => {
    const start = formatNativeTime(row.start_time)
    const end = formatNativeTime(row.end_time)
    const flags = String(row.quality_flags ?? "")
      .split(";")
      .filter(Boolean)
    const abnormal = row.prediction === "Abnormal resistance"
    const lowConfidence = String(row.confidence ?? "").startsWith("Low") || flags.length > 0

    return {
      index: index + 1,
      date: start.date,
      start: start.time,
      end: end.time,
      label: String(row.prediction),
      operation: String(row.operation ?? ""),
      ratio: Number(row.resistance_ratio),
      threshold: Number(row.threshold),
      margin: Number(row.margin_to_threshold),
      confidence: String(row.confidence ?? ""),
      flags,
      condition: abnormal ? "issue" : lowConfidence ? "review" : "normal",
    }
  })

  const total = cycles.length
  const abnormal = cycles.filter((cycle) => cycle.condition === "issue").length
  const review = cycles.filter((cycle) => cycle.condition === "review").length

  return {
    headline: "Saloon door cycle diagnostics",
    verdict: {
      condition: abnormal > 0 ? "issue" : "normal",
      text:
        abnormal > 0
          ? `${abnormal} of ${total} door cycles show abnormal resistance`
          : `All ${total} door cycles are within the normal resistance range`,
    },
    cars: idleCars().map((car) => ({
      ...car,
      finding: "Door results are reported per cycle, not per car",
    })),
    kpis: [
      { label: "Cycles Evaluated", value: String(total), condition: "neutral" },
      {
        label: "Abnormal",
        value: cycleCount(abnormal),
        condition: abnormal > 0 ? "issue" : "normal",
      },
      {
        label: "Review",
        value: cycleCount(review),
        condition: review > 0 ? "review" : "neutral",
      },
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
    cars: idleCars().map((car) => ({
      ...car,
      finding: "Rail scan is reported for the whole consist",
    })),
    kpis: [
      { label: "Active File", value: result.filename, condition: "neutral" },
      {
        label: "Mean Speed",
        value: speed === null ? "—" : `${speed.toFixed(1)} km/h`,
        condition: "neutral",
      },
      {
        label: "Speed Changes",
        value: changes === null ? "—" : String(changes),
        condition: "neutral",
      },
      {
        label: "Verdict",
        value: damaged ? `${label} Corrugation` : "Normal",
        condition: damaged ? "issue" : "normal",
      },
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
    cars: idleCars().map((car) => ({
      ...car,
      finding: "Fatigue damage is reported for the measured record",
    })),
    kpis: [
      { label: "Record", value: result.filename, condition: "neutral" },
      {
        label: "Damage Index D",
        value: valid ? damage.toFixed(3) : "—",
        condition,
      },
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
