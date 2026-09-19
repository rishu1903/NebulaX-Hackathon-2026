"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Clock3, Gauge, ShieldAlert } from "lucide-react"
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

export function PanelDoor({ cycles }: { cycles: DoorCycle[] }) {
  const defaultIndex = useMemo(
    () =>
      cycles.find((cycle) => cycle.condition === "issue")?.index ??
      cycles.find((cycle) => cycle.condition === "review")?.index ??
      cycles[0]?.index ??
      null,
    [cycles],
  )

  const [selectedIndex, setSelectedIndex] = useState<number | null>(defaultIndex)

  useEffect(() => {
    setSelectedIndex(defaultIndex)
  }, [defaultIndex])

  const selected =
    cycles.find((cycle) => cycle.index === selectedIndex) ??
    cycles[0] ??
    null

  const abnormal = cycles.filter((cycle) => cycle.label === "Abnormal resistance").length
  const normal = cycles.length - abnormal
  const review = cycles.filter(
    (cycle) => cycle.flags.length > 0 || cycle.confidence.toLowerCase().startsWith("low"),
  ).length
  const attention = cycles.filter(
    (cycle) => cycle.label === "Abnormal resistance" || cycle.flags.length > 0,
  )

  if (cycles.length === 0) {
    return (
      <div>
        <PanelTitle
          title="Door Cycle Analysis"
          hint="No operating cycles were detected in the uploaded telemetry."
        />
      </div>
    )
  }

  return (
    <div>
      <PanelTitle
        title="Door Cycle Analysis"
        hint="Each numbered block represents one detected door movement in chronological order. Select a cycle to review its classification and supporting measurements."
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Cycles detected" value={String(cycles.length)} tone="neutral" />
        <SummaryCard label="Normal" value={String(normal)} tone="normal" />
        <SummaryCard label="Abnormal resistance" value={String(abnormal)} tone={abnormal > 0 ? "issue" : "normal"} />
      </div>

      <div className="mt-5 rounded-xl border border-border bg-slate-50/60 p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Cycle sequence
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Earlier cycles are shown on the left. Select any cycle for details.
            </p>
          </div>

          {review > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
              <ShieldAlert className="size-3.5" aria-hidden="true" />
              {review} {review === 1 ? "cycle needs" : "cycles need"} review
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="list" aria-label="Door cycle sequence">
          {cycles.map((cycle) => {
            const meta = CONDITION_META[cycle.condition]
            const isSelected = cycle.index === selected?.index

            return (
              <button
                key={cycle.index}
                type="button"
                role="listitem"
                onClick={() => setSelectedIndex(cycle.index)}
                aria-pressed={isSelected}
                aria-label={`Cycle ${cycle.index}: ${cycle.label}`}
                title={`Cycle ${cycle.index} · ${cycle.operation} · ${cycle.label}`}
                className={[
                  "flex size-9 items-center justify-center rounded-md text-[11px] font-bold text-white transition",
                  "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-slate-400/40",
                  isSelected ? "scale-110 ring-2 ring-slate-950 ring-offset-2" : "hover:scale-105",
                ].join(" ")}
                style={{ backgroundColor: meta.color }}
              >
                {cycle.index}
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
          <Legend condition="normal" label="Normal" />
          <Legend condition="review" label="Normal result requiring review" />
          <Legend condition="issue" label="Abnormal resistance" />
        </div>
      </div>

      {selected && <SelectedCycle cycle={selected} />}

      {attention.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Cycles requiring attention
          </p>
          <div className="mt-2 overflow-hidden rounded-xl border border-border">
            {attention.map((cycle) => {
              const meta = CONDITION_META[cycle.condition]
              return (
                <button
                  key={cycle.index}
                  type="button"
                  onClick={() => setSelectedIndex(cycle.index)}
                  className="grid w-full grid-cols-[70px_minmax(0,1fr)_110px] items-center gap-3 border-b border-border bg-white px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50"
                >
                  <span className="text-sm font-bold text-slate-800">Cycle {cycle.index}</span>

                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-slate-700">
                      {cycle.operation} · {cycle.start} – {cycle.end}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                      {cycle.flags.length > 0
                        ? cycle.flags.map((flag) => FLAG_LABELS[flag] ?? humanizeFlag(flag)).join(" · ")
                        : "No quality flags"}
                    </span>
                  </span>

                  <span
                    className="justify-self-end rounded-md px-2 py-1 text-xs font-bold"
                    style={{ backgroundColor: meta.soft, color: meta.color }}
                  >
                    {cycle.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
        <strong className="text-slate-700">How the model evaluates resistance:</strong> motor current represents load,
        while back-EMF reflects motor speed. Their ratio is used as a mechanical-resistance indicator. Opening and
        closing cycles use separate decision thresholds.
      </div>
    </div>
  )
}

function SelectedCycle({ cycle }: { cycle: DoorCycle }) {
  const meta = CONDITION_META[cycle.condition]
  const marginPct = Number.isFinite(cycle.margin) ? cycle.margin * 100 : null
  const flagLabels = cycle.flags.map((flag) => FLAG_LABELS[flag] ?? humanizeFlag(flag))

  return (
    <div
      className="mt-5 overflow-hidden rounded-xl border bg-white"
      style={{ borderColor: cycle.condition === "normal" ? "var(--border)" : meta.color }}
    >
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: meta.soft, color: meta.color }}
          >
            {cycle.condition === "issue" ? (
              <AlertTriangle className="size-5" aria-hidden="true" />
            ) : cycle.condition === "review" ? (
              <ShieldAlert className="size-5" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="size-5" aria-hidden="true" />
            )}
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Selected cycle
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h4 className="text-xl font-bold tracking-tight text-slate-950">Cycle {cycle.index}</h4>
              <span
                className="rounded-md px-2 py-1 text-xs font-bold"
                style={{ backgroundColor: meta.soft, color: meta.color }}
              >
                {cycle.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {cycle.operation || "Door movement"} · {cycle.date || "Recorded telemetry"}
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Confidence</p>
          <p className="mt-0.5 text-sm font-bold text-slate-800">{cycle.confidence || "Not reported"}</p>
        </div>
      </div>

      <div className="grid gap-0 md:grid-cols-2">
        <div className="border-b border-border p-4 md:border-b-0 md:border-r">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <Clock3 className="size-3.5" aria-hidden="true" />
            Timing
          </p>

          <dl className="mt-3 grid grid-cols-[90px_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">Start</dt>
            <dd className="font-semibold text-slate-800">{cycle.start || "—"}</dd>

            <dt className="text-slate-500">End</dt>
            <dd className="font-semibold text-slate-800">{cycle.end || "—"}</dd>

            <dt className="text-slate-500">Duration</dt>
            <dd className="font-semibold text-slate-800">
              {cycle.durationSeconds === null ? "—" : `${cycle.durationSeconds.toFixed(2)} s`}
            </dd>

            <dt className="text-slate-500">Operation</dt>
            <dd className="font-semibold text-slate-800">{cycle.operation || "—"}</dd>
          </dl>
        </div>

        <div className="p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <Gauge className="size-3.5" aria-hidden="true" />
            Resistance decision
          </p>

          <dl className="mt-3 grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">Resistance ratio</dt>
            <dd className="font-semibold text-slate-800">{formatMetric(cycle.ratio, 5)}</dd>

            <dt className="text-slate-500">Decision threshold</dt>
            <dd className="font-semibold text-slate-800">{formatMetric(cycle.threshold, 5)}</dd>

            <dt className="text-slate-500">Threshold margin</dt>
            <dd className="font-semibold" style={{ color: meta.color }}>
              {marginPct === null ? "—" : `${marginPct >= 0 ? "+" : ""}${marginPct.toFixed(1)}%`}
            </dd>
          </dl>

          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            {marginPct === null
              ? "No threshold margin was reported for this cycle."
              : marginPct > 0
                ? "The resistance indicator is above the decision threshold for this operation."
                : "The resistance indicator is below the decision threshold for this operation."}
          </p>
        </div>
      </div>

      <div className="border-t border-border bg-slate-50/60 px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Quality checks</p>

        {flagLabels.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {flagLabels.map((flag) => (
              <span
                key={flag}
                className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
              >
                {flag}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-xs font-medium text-emerald-700">
            No data-quality flags were raised for this cycle.
          </p>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "neutral" | "normal" | "issue"
}) {
  const condition = tone === "neutral" ? null : CONDITION_META[tone]

  return (
    <div
      className="rounded-xl border border-border bg-white p-3"
      style={condition ? { borderColor: condition.color } : undefined}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className="mt-1 text-2xl font-bold tracking-tight text-slate-950"
        style={condition ? { color: condition.color } : undefined}
      >
        {value}
      </p>
    </div>
  )
}

function Legend({
  condition,
  label,
}: {
  condition: "normal" | "review" | "issue"
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="size-3 rounded-sm"
        style={{ backgroundColor: CONDITION_META[condition].color }}
      />
      {label}
    </span>
  )
}

function humanizeFlag(flag: string) {
  return flag
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatMetric(value: number, digits: number) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—"
}
