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
  durationSeconds: number | null
  label: string
  operation: string
  ratio: number
  threshold: number
  margin: number
  confidence: string
  flags: string[]
  condition: Condition
}

export type RailHotspot = {
  startM: number
  endM: number
  centerM: number
  peakToMedianEnergy: number
}

export type ShmSignalPoint = {
  sample: number
  value: number
}

export type Panel =
  | { kind: "acv"; rows: AcvRow[]; margin: number | null; emptyCars: string[] }
  | { kind: "door"; cycles: DoorCycle[]; abnormal: number; review: number; showcaseLocation: string | null }
  | {
      kind: "rail"
      label: string
      side: "I" | "II" | null
      speedKmh: number | null
      speedChanges: number | null
      distanceM: number | null
      hotspot: RailHotspot | null
      filename: string
      lowMotion: boolean
    }
  | { kind: "shm"; damage: number; condition: Condition; signal: ShmSignalPoint[]; sampleCount: number | null }

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

function nativeTimestampMs(stamp: string): number | null {
  const parts = String(stamp).split("-").map(Number)
  if (parts.length !== 7 || parts.some(Number.isNaN)) return null
  const [y, mo, d, h, mi, s, ms] = parts
  return Date.UTC(y, mo - 1, d, h, mi, s, ms)
}

const cycleCount = (n: number) => `${n} ${n === 1 ? "Cycle" : "Cycles"}`

function doorView(result: AnalyseResult): LiveView {
  const cycles: DoorCycle[] = (result.table ?? []).map((row, index) => {
    const start = formatNativeTime(row.start_time)
    const end = formatNativeTime(row.end_time)
    const startMs = nativeTimestampMs(row.start_time)
    const endMs = nativeTimestampMs(row.end_time)
    const durationSeconds =
      startMs !== null && endMs !== null && endMs >= startMs
        ? (endMs - startMs) / 1000
        : null

    const flags = String(row.quality_flags ?? "")
      .split(";")
      .filter(Boolean)

    const abnormal = row.prediction === "Abnormal resistance"
    const lowConfidence = String(row.confidence ?? "").toLowerCase().startsWith("low") || flags.length > 0

    return {
      index: index + 1,
      date: start.date,
      start: start.time,
      end: end.time,
      durationSeconds,
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
  const abnormal = cycles.filter((cycle) => cycle.label === "Abnormal resistance").length
  const normal = total - abnormal
  const review = cycles.filter(
    (cycle) => cycle.flags.length > 0 || cycle.confidence.toLowerCase().startsWith("low"),
  ).length

  return {
    headline: "Door resistance cycle analysis",
    verdict: {
      condition: abnormal > 0 ? "issue" : "normal",
      text:
        abnormal > 0
          ? `${abnormal} of ${total} detected door cycles show abnormal resistance`
          : `All ${total} detected door cycles are classified as normal`,
    },
    cars: idleCars().map((car) => car.id === 3 && abnormal > 0 ? {
      ...car,
      finding: "Showcase placement: Door 2 is highlighted for presentation context. The model reports cycle-level resistance and does not localise the carriage.",
      overlay: { kind: "door", condition: "issue", label: "Door 2", componentIndex: 2, source: "showcase" },
    } : {
      ...car,
      finding: "Door findings are reported by operating cycle, not by carriage",
    }),
    kpis: [
      { label: "Cycles Detected", value: String(total), condition: "neutral" },
      {
        label: "Normal",
        value: cycleCount(normal),
        condition: normal > 0 ? "normal" : "neutral",
      },
      {
        label: "Abnormal",
        value: cycleCount(abnormal),
        condition: abnormal > 0 ? "issue" : "normal",
      },
      {
        label: "Needs Review",
        value: cycleCount(review),
        condition: review > 0 ? "review" : "normal",
      },
    ],
    railSide: null,
    panel: { kind: "door", cycles, abnormal, review, showcaseLocation: abnormal > 0 ? "Car 03 · Door 2" : null },
    ...base(result),
  }
}

/* ------------------------------ Rail ----------------------------- */

function railView(result: AnalyseResult): LiveView {
  const label = String(result.prediction ?? "")
  const side = label === "Side I" ? "I" : label === "Side II" ? "II" : null
  const damaged = side !== null
  const speed = typeof result.summary?.speed_kmh === "number" ? result.summary.speed_kmh : null
  const changes =
    typeof result.summary?.speed_transitions === "number"
      ? result.summary.speed_transitions
      : null
  const lowMotion = Boolean(result.summary?.low_transition_override)
  const distanceM = changes === null ? null : changes * 0.014835
  const rawHotspot = result.summary?.hotspot
  const hotspot: RailHotspot | null =
    rawHotspot &&
    [rawHotspot.start_m, rawHotspot.end_m, rawHotspot.center_m, rawHotspot.peak_to_median_energy].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
      ? {
          startM: rawHotspot.start_m,
          endM: rawHotspot.end_m,
          centerM: rawHotspot.center_m,
          peakToMedianEnergy: rawHotspot.peak_to_median_energy,
        }
      : null

  return {
    headline: "Rail corrugation classification",
    verdict: {
      condition: damaged ? "issue" : "normal",
      text: damaged
        ? `Side ${side} is classified as showing rail corrugation`
        : "The uploaded recording is classified as normal",
    },
    // Rail inference is performed on the uploaded track recording. It does not identify a carriage.
    cars: idleCars().map((car) => ({
      ...car,
      finding: "Rail condition is reported for the uploaded track recording, not by carriage",
    })),
    kpis: [
      {
        label: "Traversed Distance",
        value: distanceM === null ? "—" : `${distanceM.toFixed(2)} m`,
        condition: "neutral",
      },
      {
        label: "Mean Speed",
        value: speed === null ? "—" : `${speed.toFixed(1)} km/h`,
        condition: "neutral",
      },
      {
        label: "Affected Rail",
        value: damaged ? `Side ${side} Corrugation` : "Normal",
        condition: damaged ? "issue" : "normal",
      },
      {
        label: "Estimated Hotspot",
        value: hotspot ? `${hotspot.startM.toFixed(2)}–${hotspot.endM.toFixed(2)} m` : "None",
        condition: hotspot ? "issue" : "normal",
      },
    ],
    railSide: side,
    panel: {
      kind: "rail",
      label,
      side,
      speedKmh: speed,
      speedChanges: changes,
      distanceM,
      hotspot,
      filename: result.filename || "Recording",
      lowMotion,
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
  const chartData = result.chart_data && typeof result.chart_data === "object"
    ? (result.chart_data as Record<string, any>).signal
    : null
  const indices = Array.isArray(chartData?.sample_indices) ? chartData.sample_indices : []
  const values = Array.isArray(chartData?.raw_values) ? chartData.raw_values : []
  const signal: ShmSignalPoint[] = indices.length === values.length
    ? indices.flatMap((sample: unknown, index: number) => {
        const value = values[index]
        return typeof sample === "number" && Number.isFinite(sample) && typeof value === "number" && Number.isFinite(value)
          ? [{ sample, value }]
          : []
      })
    : []
  const sampleCount = typeof chartData?.total_samples === "number" && Number.isFinite(chartData.total_samples)
    ? chartData.total_samples
    : null

  const condition: Condition = !valid
    ? "neutral"
    : damage >= SHM_BANDS.issue
      ? "issue"
      : damage >= SHM_BANDS.review
        ? "review"
        : "normal"

  const damageStatus = !valid
    ? "No cumulative damage value computed"
    : damage >= SHM_BANDS.issue
      ? `Critical Fatigue Damage (D = ${damage.toFixed(4)} >= 0.8)`
      : damage >= SHM_BANDS.review
        ? `Elevated Fatigue Damage (D = ${damage.toFixed(4)} >= 0.5)`
        : `Nominal Structural Health (D = ${damage.toFixed(4)} < 0.5)`

  return {
    headline: "Structural fatigue damage prediction",
    verdict: {
      condition,
      text: valid
        ? `Predicted cumulative fatigue damage D = ${damage.toFixed(4)}`
        : "No cumulative fatigue damage value could be computed",
    },
    cars: idleCars().map((car) => ({
      ...car,
      condition,
      finding: `Consist structural health: ${damageStatus}. Result applies to the complete structural record.`,
    })),
    kpis: [
      {
        label: "Predicted Damage D",
        value: valid ? damage.toFixed(4) : "—",
        condition,
      },
      {
        label: "Model Scope",
        value: "Full Record",
        condition: "neutral",
      },
      {
        label: "Input Signal",
        value: sampleCount === null ? "Uploaded Record" : `${sampleCount.toLocaleString()} Samples`,
        condition: "neutral",
      },
      {
        label: "Localisation",
        value: "Not Provided",
        condition: "neutral",
      },
    ],
    railSide: null,
    panel: {
      kind: "shm",
      damage: valid ? damage : 0,
      condition,
      signal,
      sampleCount,
    },
    ...base(result),
  }
}
