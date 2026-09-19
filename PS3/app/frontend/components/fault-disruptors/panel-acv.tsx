"use client"

import { CONDITION_META } from "@/lib/fault-disruptors/data"
import { carLabel } from "@/lib/fault-disruptors/data"
import type { AcvRow } from "@/lib/fault-disruptors/live"

export function PanelAcv({ rows, margin, emptyCars }: { rows: AcvRow[]; margin: number | null; emptyCars: string[] }) {
  return (
    <div>
      <PanelTitle
        title="Refrigerant Leak Ranking"
        hint="Every car ranked from most to least likely to have the leak — inspect from the top"
      />
      <div className="mt-4 space-y-3">
        {rows.map((r) => {
          const meta = CONDITION_META[r.condition]
          return (
            <div key={r.car} className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-sm font-semibold text-slate-700">{carLabel(r.car)}</span>
              <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-slate-100">
                <div
                  className="h-full rounded-md transition-all duration-700"
                  style={{ width: `${r.value}%`, backgroundColor: meta.color }}
                />
              </div>
              <span className="w-40 shrink-0 text-right text-xs font-medium text-slate-500">
                <span className="font-bold" style={{ color: meta.color }}>
                  #{r.rank}
                </span>{" "}
                {r.note}
                {r.score !== null && <span className="ml-1 text-slate-400">({r.score >= 0 ? "+" : ""}{r.score.toFixed(3)})</span>}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-4 space-y-1 text-xs text-slate-500">
        {margin !== null && <p>Gap between 1st and 2nd: {margin.toFixed(3)} (larger means a clearer call).</p>}
        {emptyCars.length > 0 && (
          <p>No usable sensor data for {emptyCars.map(carLabel).join(", ")}; ranked last.</p>
        )}
        <p>
          Score = how much further above its cooling setpoint a car runs than its sibling cars while cooling. Higher
          means more suspect.
        </p>
      </div>
    </div>
  )
}

export function PanelTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  )
}
