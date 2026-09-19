"use client"

import { AlertTriangle, ArrowDown, CheckCircle2 } from "lucide-react"
import { CONDITION_META, carLabel } from "@/lib/fault-disruptors/data"
import type { AcvRow } from "@/lib/fault-disruptors/live"

export function PanelAcv({
  rows,
  margin,
  emptyCars,
}: {
  rows: AcvRow[]
  margin: number | null
  emptyCars: string[]
}) {
  const ranked = [...rows].sort((a, b) => a.rank - b.rank)
  const top = ranked[0]

  return (
    <div>
      <PanelTitle
        title="Refrigerant Leak Inspection Priority"
        hint="All 8 carriages are ranked from highest to lowest refrigerant-leak suspicion using the uploaded telemetry."
      />

      {top && (
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.6fr)]">
          <div className="rounded-xl border border-red-200 bg-red-50/70 p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white">
                <AlertTriangle className="size-5" aria-hidden="true" />
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-red-700">
                  First inspection priority
                </p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{carLabel(top.car)}</p>
                <p className="mt-1 text-sm text-slate-600">
                  Highest refrigerant-leak suspicion score in this 8-car consist.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-slate-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Separation from #2
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
              {margin === null ? "—" : margin.toFixed(3)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Difference between the top two model scores. A larger value indicates a clearer first inspection priority.
            </p>
          </div>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[58px_78px_minmax(140px,1fr)_130px] gap-3 border-b border-border bg-slate-50 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <span>Rank</span>
          <span>Carriage</span>
          <span>Relative score</span>
          <span className="text-right">Assessment</span>
        </div>

        <div className="divide-y divide-border">
          {ranked.map((row) => {
            const meta = CONDITION_META[row.condition]
            const isTop = row.rank === 1

            return (
              <div
                key={row.car}
                className={[
                  "grid grid-cols-[58px_78px_minmax(140px,1fr)_130px] items-center gap-3 px-4 py-3",
                  isTop ? "bg-red-50/50" : "bg-white",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex size-7 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: isTop ? "#dc2626" : row.rank <= 3 ? "#f59e0b" : "#64748b" }}
                  >
                    {row.rank}
                  </span>
                </div>

                <span className="text-sm font-bold text-slate-800">{carLabel(row.car)}</span>

                <div>
                  <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.max(2, row.value)}%`,
                        backgroundColor: isTop ? "#dc2626" : meta.color,
                      }}
                    />
                  </div>

                  <p className="mt-1 text-[11px] text-slate-400">
                    {row.score === null
                      ? "No usable score"
                      : `Model score ${row.score >= 0 ? "+" : ""}${row.score.toFixed(3)}`}
                  </p>
                </div>

                <div className="text-right">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold"
                    style={{ backgroundColor: meta.soft, color: meta.color }}
                  >
                    {row.condition === "normal" ? (
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    ) : (
                      <ArrowDown className="size-3.5" aria-hidden="true" />
                    )}
                    {isTop ? "Inspect first" : row.note}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
        <p className="rounded-lg bg-slate-50 px-3 py-2">
          <strong className="text-slate-700">How to read the score:</strong> it measures how much further above its
          cooling setpoint a carriage operates relative to the other carriages in the same uploaded case. It is a
          ranking score, not a failure probability.
        </p>

        <p className="rounded-lg bg-slate-50 px-3 py-2">
          <strong className="text-slate-700">Recommended workflow:</strong> inspect the highest-ranked carriage first,
          then continue down the ranking if the initial inspection does not explain the cooling deviation.
        </p>
      </div>

      {emptyCars.length > 0 && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          No usable sensor data was available for {emptyCars.map(carLabel).join(", ")}. These carriages are placed at
          the end of the ranking.
        </p>
      )}
    </div>
  )
}

export function PanelTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{hint}</p>
    </div>
  )
}
