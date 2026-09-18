"use client"

import { ACV_RANKING, CONDITION_META } from "@/lib/fault-disruptors/data"

export function PanelAcv() {
  return (
    <div>
      <PanelTitle title="Refrigerant Leak Ranking" hint="Model-predicted inspection priority across the consist" />
      <div className="mt-4 space-y-3">
        {ACV_RANKING.map((r) => {
          const meta = CONDITION_META[r.condition]
          return (
            <div key={r.car} className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-sm font-semibold text-slate-700">{r.car}</span>
              <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-slate-100">
                <div
                  className="h-full rounded-md transition-all duration-700"
                  style={{ width: `${r.value}%`, backgroundColor: meta.color }}
                />
              </div>
              <span className="w-28 shrink-0 text-right text-xs font-medium text-slate-500">
                <span className="font-bold" style={{ color: meta.color }}>
                  #{r.rank}
                </span>{" "}
                {r.note}
              </span>
            </div>
          )
        })}
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
