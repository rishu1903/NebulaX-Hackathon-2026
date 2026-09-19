"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, ChevronDown, Copy, Check } from "lucide-react"
import { CONDITION_META } from "@/lib/fault-disruptors/data"
import type { DoorCycle } from "@/lib/fault-disruptors/live"
import { PanelTitle } from "@/components/fault-disruptors/panel-acv"

const FLAG_LABELS: Record<string, string> = {
  ambiguous_operation: "Ambiguous open/close command",
  short_segment: "Short telemetry segment",
  low_back_emf: "Low back-EMF",
  length_outside_train_envelope: "Cycle length outside training envelope",
  travel_outside_train_envelope: "Door travel outside training envelope",
  near_threshold: "Near decision threshold",
}

/**
 * Training-set cycle-duration envelopes, measured on the 110 labelled cycles.
 * Open  137-147 rows -> 2.72-2.92 s
 * Close 178-190 rows -> 3.54-3.78 s
 * Mirrors TRAIN_ENVELOPE in predict_door.py.
 */
const DURATION_ENVELOPE: Record<string, { lo: number; hi: number; rows: string }> = {
  Open: { lo: 2.72, hi: 2.92, rows: "137–147" },
  Close: { lo: 3.54, hi: 3.78, rows: "178–190" },
}

/**
 * The model's own guardrail. predict_door.py sets NEAR_THRESHOLD = 0.05 and computes
 * margin = (ratio - threshold) / threshold, so "within ±5% of the cut point" is
 * 95–105% of limit, and any cycle in it gets confidence "Low - review".
 *
 * This zone is a CONFIDENCE overlay, not a verdict. It straddles the cut point, so it
 * holds both Normal and Abnormal cycles. The verdict always comes from the model.
 */
const NEAR_THRESHOLD_PCT = 5
const BAND_LOWER = 100 - NEAR_THRESHOLD_PCT
const BAND_UPPER = 100 + NEAR_THRESHOLD_PCT

const LABEL_ABNORMAL = "Abnormal resistance"

type Derived = DoorCycle & {
  percentOfLimit: number
  elapsedSeconds: number
  nRows: number | null
  /** Straight from the model's prediction — never re-derived from a UI threshold. */
  isAbnormal: boolean
  /** Inside the model's ±5% guardrail. Independent of the verdict. */
  nearThreshold: boolean
  needsReview: boolean
}

/** Verdict wording and colour. Driven by the model's label, never by band membership. */
function verdictOf(isAbnormal: boolean): { word: string; condition: "normal" | "issue" } {
  return isAbnormal
    ? { word: LABEL_ABNORMAL, condition: "issue" }
    : { word: "No fault detected", condition: "normal" }
}

/** "HH:MM:SS.mmm" -> seconds since midnight. */
function clockToSeconds(clock: string): number | null {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(clock.trim())
  if (!m) return null
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4] ?? 0) / 1000
}

/** Seconds of elapsed time -> "mm:ss". Truncates, the way a clock reads. */
function mmss(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

export function PanelDoor({
  cycles,
  showcaseLocation,
}: {
  cycles: DoorCycle[]
  showcaseLocation?: string | null
}) {
  const [showAllFlagged, setShowAllFlagged] = useState(false)
  const [highlight, setHighlight] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const derived: Derived[] = useMemo(() => {
    const starts = cycles.map((c) => clockToSeconds(c.start))
    const base = starts.reduce<number | null>(
      (acc, s) => (s === null ? acc : acc === null ? s : Math.min(acc, s)),
      null,
    )

    return cycles.map((cycle, i) => {
      const pct =
        Number.isFinite(cycle.ratio) && Number.isFinite(cycle.threshold) && cycle.threshold !== 0
          ? (cycle.ratio / cycle.threshold) * 100
          : 0
      const s = starts[i]
      // Telemetry is sampled every 20 ms, so a cycle spanning d seconds holds d/0.02 + 1 rows.
      const nRows =
        cycle.durationSeconds !== null ? Math.round(cycle.durationSeconds / 0.02) + 1 : null

      return {
        ...cycle,
        percentOfLimit: pct,
        elapsedSeconds: s !== null && base !== null ? s - base : 0,
        nRows,
        // The model's verdict, taken as given. Do not re-derive it from a UI cut-off:
        // the classifier flags anything above its threshold, i.e. above 100% of limit.
        isAbnormal: cycle.label === LABEL_ABNORMAL,
        nearThreshold: Math.abs(pct - 100) < NEAR_THRESHOLD_PCT,
        needsReview:
          cycle.flags.length > 0 || cycle.confidence.toLowerCase().startsWith("low"),
      }
    })
  }, [cycles])

  const total = derived.length
  const over = useMemo(() => derived.filter((c) => c.isAbnormal), [derived])
  const flaggedForReview = useMemo(() => derived.filter((c) => c.needsReview), [derived])
  const rate = total > 0 ? Math.round((over.length / total) * 100) : 0

  const bySeverity = useMemo(
    () => [...over].sort((a, b) => b.percentOfLimit - a.percentOfLimit),
    [over],
  )

  const spanSeconds = useMemo(
    () => derived.reduce((max, c) => Math.max(max, c.elapsedSeconds), 0),
    [derived],
  )

  if (total === 0) {
    return (
      <div>
        <PanelTitle
          title="Door Cycle Analysis"
          hint="No operating cycles were detected in the uploaded telemetry."
        />
      </div>
    )
  }

  // Action-line range: how far above the limit the over-limit cycles actually sit.
  const excessLo = over.length > 0 ? Math.round(Math.min(...over.map((c) => c.percentOfLimit)) - 100) : 0
  const excessHi = over.length > 0 ? Math.round(Math.max(...over.map((c) => c.percentOfLimit)) - 100) : 0

  const visibleFlagged = showAllFlagged ? bySeverity : bySeverity.slice(0, 5)

  function copyFlagged() {
    const text = bySeverity
      .map((c) => `${mmss(c.elapsedSeconds)}\t${c.operation}\t${Math.round(c.percentOfLimit)}% of limit`)
      .join("\n")
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      },
      () => setCopied(false),
    )
  }

  return (
    <div>
      {/* ---------------------------------------------------------------- headline */}
      <div>
        <h3 className="text-2xl font-bold leading-tight tracking-tight text-slate-950 sm:text-[28px]">
          {over.length > 0
            ? `${over.length} of ${total} door cycles show abnormal resistance`
            : `No faults detected. ${total} cycles checked.`}
        </h3>

        <p className="mt-1.5 text-sm font-semibold text-slate-700">
          {over.length > 0
            ? `Inspect this door — ${over.length} of ${total} cycles over limit, resistance ${excessLo}–${excessHi}% above.`
            : "Every cycle measured below the resistance limit."}
        </p>

        {/* These are findings from a recording, not live alerts. Saying so up front stops
            the timestamps reading as "go and look now" — the cycles are already over. */}
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Findings from a {(spanSeconds / 60).toFixed(1)}-minute recording — actioned at the next
          depot opportunity, not in real time. Timestamps locate each cycle within the file.
          {showcaseLocation ? (
            <>
              {" "}
              <span className="font-semibold text-slate-600">{showcaseLocation}</span> is a
              presentation label only: the telemetry carries no carriage or door identifier.
            </>
          ) : null}
        </p>
      </div>

      {/* ------------------------------------------------------------------- chart */}
      <ResistanceChart
        cycles={derived}
        spanSeconds={spanSeconds}
        highlight={highlight}
        onHighlight={setHighlight}
      />

      {/* ----------------------------------------------------------- flagged cycles */}
      {over.length > 0 && (
        <div className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-slate-900">
              Flagged cycles — {over.length} of {total} over limit ({rate}%)
            </h4>

            <button
              type="button"
              onClick={copyFlagged}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-slate-400/40"
            >
              {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
              {copied ? "Copied" : "Copy list"}
            </button>
          </div>

          <div className="mt-2 overflow-hidden rounded-xl border border-border">
            {visibleFlagged.map((cycle, rank) => {
              const isHot = highlight === cycle.index
              return (
                <button
                  key={cycle.index}
                  type="button"
                  onMouseEnter={() => setHighlight(cycle.index)}
                  onMouseLeave={() => setHighlight(null)}
                  onFocus={() => setHighlight(cycle.index)}
                  onBlur={() => setHighlight(null)}
                  aria-label={`Cycle at ${mmss(cycle.elapsedSeconds)}, ${cycle.operation}, ${Math.round(cycle.percentOfLimit)} percent of limit`}
                  className={[
                    "grid w-full grid-cols-[76px_72px_minmax(0,1fr)] items-center gap-3 border-b border-border px-4 py-2.5 text-left transition last:border-b-0",
                    isHot ? "bg-slate-100" : "bg-white hover:bg-slate-50",
                  ].join(" ")}
                >
                  <span className="font-mono text-sm font-bold tabular-nums text-slate-900">
                    {mmss(cycle.elapsedSeconds)}
                  </span>
                  <span className="text-xs font-semibold text-slate-600">{cycle.operation}</span>
                  <span className="flex items-baseline gap-2">
                    <span
                      className="text-sm font-bold tabular-nums"
                      style={{ color: CONDITION_META.issue.color }}
                    >
                      {Math.round(cycle.percentOfLimit)}% of limit
                    </span>
                    {rank === 0 && (
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        ← worst
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>

          {bySeverity.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllFlagged((v) => !v)}
              className="mt-2 text-xs font-semibold text-slate-600 underline underline-offset-2 transition hover:text-slate-900"
            >
              {showAllFlagged ? "Show top 5 only" : `+ ${bySeverity.length - 5} more  [show all]`}
            </button>
          )}

          {/* ------------------------------------------------------- reasoning line */}
          <p className="mt-3 text-sm text-slate-600">{reasoningLine(over)}</p>
        </div>
      )}

      {/* ---------------------------------------------------------- review banner(s) */}
      {flaggedForReview.map((cycle) => (
        <ReviewBanner key={`review-${cycle.index}`} cycle={cycle} />
      ))}

      {/* ------------------------------------------------------------- trust panel */}
      <TrustPanel cycles={derived} total={total} over={over.length} />
    </div>
  )
}

/* ------------------------------------------------------------------------- chart */

function ResistanceChart({
  cycles,
  spanSeconds,
  highlight,
  onHighlight,
}: {
  cycles: Derived[]
  spanSeconds: number
  highlight: number | null
  onHighlight: (index: number | null) => void
}) {
  const W = 800
  const H = 340
  const L = 62
  const R = 18
  const T = 18
  const B = 52

  const yMax = 200
  const xMax = Math.max(spanSeconds, 1)

  const px = (s: number) => L + ((W - L - R) * s) / xMax
  const py = (pct: number) => T + (H - T - B) * (1 - Math.min(pct, yMax) / yMax)

  // x ticks every 5 minutes, plus the end
  const tickStep = 300
  const ticks: number[] = []
  for (let s = 0; s <= xMax; s += tickStep) ticks.push(s)

  const spanMinutes = (spanSeconds / 60).toFixed(1)

  return (
    <div className="mt-6">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Scatter of mechanical resistance as a percentage of limit against time. ${cycles.length} cycles over ${spanMinutes} minutes.`}
      >
        {/* y gridlines */}
        {[0, 50, 100, 150, 200].map((v) => (
          <g key={v}>
            <line x1={L} y1={py(v)} x2={W - R} y2={py(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={L - 10} y={py(v) + 4} textAnchor="end" fontSize={11} fill="#64748b">
              {v}%
            </text>
          </g>
        ))}

        {/* amber "too close to call" band */}
        <rect
          x={L}
          y={py(BAND_UPPER)}
          width={W - L - R}
          height={py(BAND_LOWER) - py(BAND_UPPER)}
          fill={CONDITION_META.review.color}
          opacity={0.14}
        />
        <text
          x={L + 8}
          y={py(BAND_UPPER) - 5}
          fontSize={11}
          fontWeight={600}
          fill={CONDITION_META.review.color}
        >
          Low confidence (±{NEAR_THRESHOLD_PCT}%)
        </text>

        {/* limit line */}
        <line
          x1={L}
          y1={py(100)}
          x2={W - R}
          y2={py(100)}
          stroke="#0f172a"
          strokeWidth={2}
        >
          <title>Open 0.38434 · Close 0.32315</title>
        </line>
        <text x={W - R} y={py(100) - 6} textAnchor="end" fontSize={11} fontWeight={700} fill="#0f172a">
          Limit
        </text>

        {/* x axis */}
        <line x1={L} y1={py(0)} x2={W - R} y2={py(0)} stroke="#94a3b8" strokeWidth={1} />
        {ticks.map((s) => (
          <text key={s} x={px(s)} y={py(0) + 18} textAnchor="middle" fontSize={11} fill="#64748b">
            {mmss(s)}
          </text>
        ))}
        <text
          x={(L + W - R) / 2}
          y={H - 8}
          textAnchor="middle"
          fontSize={11.5}
          fontWeight={600}
          fill="#475569"
        >
          Time (mm:ss — {spanMinutes} min total)
        </text>

        {/* y axis title */}
        <text
          transform={`rotate(-90 14 ${(T + H - B) / 2})`}
          x={14}
          y={(T + H - B) / 2}
          textAnchor="middle"
          fontSize={11.5}
          fontWeight={600}
          fill="#475569"
        >
          Mechanical resistance (% of limit)
        </text>

        {/* markers: circle = Open, triangle = Close */}
        {cycles.map((c) => {
          const verdict = verdictOf(c.isAbnormal)
          const meta = CONDITION_META[verdict.condition]
          const x = px(c.elapsedSeconds)
          const y = py(c.percentOfLimit)
          const hot = highlight === c.index
          const r = hot ? 7 : 5
          // Fill carries the verdict; an amber ring carries low confidence. Two channels,
          // so a low-confidence Abnormal still reads as Abnormal.
          const ring = hot
            ? "#0f172a"
            : c.nearThreshold
              ? CONDITION_META.review.color
              : "white"
          const ringWidth = hot ? 2 : c.nearThreshold ? 2 : 1
          const label = `${mmss(c.elapsedSeconds)} · ${c.operation} · ${Math.round(c.percentOfLimit)}% of limit · ${verdict.word}${c.nearThreshold ? " (low confidence)" : ""
            } · ${c.durationSeconds !== null ? `${c.durationSeconds.toFixed(2)} s` : "duration unknown"}`

          return (
            <g
              key={c.index}
              onMouseEnter={() => onHighlight(c.index)}
              onMouseLeave={() => onHighlight(null)}
              style={{ cursor: "pointer" }}
            >
              <title>{label}</title>
              {c.operation === "Close" ? (
                <polygon
                  points={`${x},${y - r} ${x + r},${y + r * 0.8} ${x - r},${y + r * 0.8}`}
                  fill={meta.color}
                  stroke={ring}
                  strokeWidth={ringWidth}
                />
              ) : (
                <circle cx={x} cy={y} r={r} fill={meta.color} stroke={ring} strokeWidth={ringWidth} />
              )}
            </g>
          )
        })}

        {/* shape key — shape carries Open/Close, never colour alone */}
        <g transform={`translate(${L + 4} ${T + 10})`}>
          <circle cx={0} cy={0} r={4.5} fill="#94a3b8" />
          <text x={9} y={4} fontSize={11} fill="#64748b">
            Open
          </text>
          <polygon points="56,-4.5 60.5,3 51.5,3" fill="#94a3b8" />
          <text x={65} y={4} fontSize={11} fill="#64748b">
            Close
          </text>
        </g>
      </svg>

      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Resistance = motor current ÷ back-EMF = load per unit speed. 100% = the level above which
        training cycles were labelled abnormal.
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------- reasoning line */

function reasoningLine(over: Derived[]): string {
  if (over.length < 2) {
    return `No pattern detected — ${over.length} affected cycle${over.length === 1 ? "" : "s"}, too few to characterise.`
  }
  const ops = new Set(over.map((c) => c.operation))
  if (ops.size === 1) {
    return `All ${over.length} affected cycles were on ${[...ops][0]}.`
  }
  return "Affects both opening and closing."
}

/* ---------------------------------------------------------------- review banner */

function ReviewBanner({ cycle }: { cycle: Derived }) {
  const env = DURATION_ENVELOPE[cycle.operation]
  const meta = CONDITION_META.review
  const pct = Math.round(cycle.percentOfLimit)
  const verdict = verdictOf(cycle.isAbnormal).word

  const labels = cycle.flags.map((f) => FLAG_LABELS[f] ?? humanizeFlag(f))

  return (
    <div
      className="mt-6 rounded-xl border-l-4 bg-amber-50/60 px-4 py-3.5"
      style={{ borderLeftColor: meta.color }}
    >
      {/* The cycle is historical — it cannot be "reviewed" in the moment. What IS actionable
          is the door, so the banner names that instead of asking for impossible work. */}
      <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <AlertTriangle className="size-4 shrink-0" style={{ color: meta.color }} aria-hidden="true" />
        {mmss(cycle.elapsedSeconds)} — verdict unreliable. Treat this door as unresolved.
      </p>

      <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
        {cycle.durationSeconds !== null && env ? (
          <>
            This {cycle.operation.toLowerCase() === "open" ? "opening" : "closing"} took{" "}
            <strong>{cycle.durationSeconds.toFixed(2)} s</strong>. Every {cycle.operation} cycle in the
            training data took <strong>{env.lo.toFixed(2)}–{env.hi.toFixed(2)} s</strong> ({env.rows} rows).{" "}
          </>
        ) : null}
        Its resistance reads <strong>{pct}% of limit</strong>, so the model returned{" "}
        <strong>{verdict.toLowerCase()}</strong> — but its own guardrails fired, so it is declining to
        stand behind that. The model measures resistance, not duration, so it cannot tell you what the
        timing means. Do not treat this door as cleared; include it in the next inspection.
      </p>

      {labels.length > 0 && (
        <p className="mt-1.5 text-xs text-slate-500">Flags: {labels.join(" · ")}</p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ trust panel */

function TrustPanel({
  cycles,
  total,
  over,
}: {
  cycles: Derived[]
  total: number
  over: number
}) {
  return (
    <details className="group mt-8 rounded-xl border border-border bg-slate-50/60 px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-700">
        How this was worked out
        <ChevronDown
          className="size-4 text-slate-400 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="mt-3 space-y-4 text-xs leading-relaxed text-slate-600">
        <p>
          <strong className="text-slate-800">The rule.</strong> Each door cycle is scored on mechanical
          resistance — motor current divided by back-EMF, i.e. load per unit speed. A cycle is flagged
          when that exceeds a limit fitted on 110 labelled training cycles.
        </p>

        <p>
          <strong className="text-slate-800">Limits.</strong> Open 0.38434 · Close 0.32315. Both are a
          20% trimmed mean of current divided by a 20% trimmed mean of back-EMF. Trimming is a choice of
          summary statistic — no rows are removed from the data.
        </p>

        <div>
          <strong className="text-slate-800">Validation.</strong>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>100% on 110 labelled training cycles</li>
            <li>leave-one-out 99.1%</li>
            <li>permutation test p &lt; 0.001</li>
            <li>predictions unchanged across 60 bootstrap refits (8–8 abnormal, sd 0.000)</li>
            <li>
              trivial &ldquo;all-Normal&rdquo; baseline scores <strong>0.727</strong> on the competition
              metric; this model scores <strong>1.000</strong>
            </li>
          </ul>
          <p className="mt-1 italic text-slate-500">
            All figures are on labelled training data. The test stream is unlabelled, so no test score
            can be computed.
          </p>
        </div>

        <p>
          <strong className="text-slate-800">The low-confidence zone.</strong> The model flags any cycle
          whose resistance lands within ±{NEAR_THRESHOLD_PCT}% of its limit as{" "}
          <code>near_threshold</code> and downgrades its confidence to &ldquo;Low – review&rdquo;. That
          zone is shaded on the chart and ringed on the affected markers. It straddles the cut point, so
          it marks verdicts the model is unsure of <em>in either direction</em> — it is not a third
          category of fault, and the verdict shown always comes from the model itself.
        </p>

        <div>
          <strong className="text-slate-800">Limitations.</strong>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>faults milder than ~25% resistance increase are not detected</li>
            <li>
              only two doors of data exist; a third door with a different baseline would shift the whole
              scale in a way the amber band does not cover
            </li>
            <li>the rule is cost-symmetric — not tuned to err on the side of catching faults</li>
            <li>the telemetry carries no door identifier</li>
          </ul>
        </div>

        <p>
          <strong className="text-slate-800">What was tested and rejected.</strong> We tested three
          hypotheses about fault structure — degradation over time, clustering of faults, and a
          characteristic position in the door stroke. All three failed (p = 0.14, p = 0.23, and peaks
          scattered across 17–58% of travel). None are shown in this interface.
        </p>

        <div>
          <strong className="text-slate-800">
            All {total} cycles ({over} over limit).
          </strong>
          <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-border bg-white">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold">Time</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Op</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Ratio</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Limit</th>
                  <th className="px-2 py-1.5 text-right font-semibold">% of limit</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Rows</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Dur (s)</th>
                  <th className="px-2 py-1.5 text-left font-semibold">State</th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((c) => (
                  <tr key={c.index} className="border-t border-border">
                    <td className="px-2 py-1 font-mono tabular-nums text-slate-700">
                      {mmss(c.elapsedSeconds)}
                    </td>
                    <td className="px-2 py-1 text-slate-600">{c.operation}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-slate-600">
                      {formatMetric(c.ratio, 5)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-slate-600">
                      {formatMetric(c.threshold, 5)}
                    </td>
                    <td className="px-2 py-1 text-right font-semibold tabular-nums text-slate-800">
                      {Math.round(c.percentOfLimit)}%
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-slate-600">
                      {c.nRows ?? "—"}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-slate-600">
                      {c.durationSeconds !== null ? c.durationSeconds.toFixed(2) : "—"}
                    </td>
                    <td
                      className="px-2 py-1 font-semibold"
                      style={{ color: CONDITION_META[verdictOf(c.isAbnormal).condition].color }}
                    >
                      {verdictOf(c.isAbnormal).word}
                      {c.nearThreshold ? " (low conf.)" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </details>
  )
}

/* ---------------------------------------------------------------------- helpers */

function humanizeFlag(flag: string) {
  const spaced = flag.replace(/_/g, " ")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function formatMetric(value: number, digits: number) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—"
}
