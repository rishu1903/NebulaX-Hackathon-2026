"use client"

import { CONDITION_META } from "@/lib/fault-disruptors/data"
import type { DoorCycle } from "@/lib/fault-disruptors/live"
import { PanelTitle } from "@/components/fault-disruptors/panel-acv"

export function PanelDoor({ cycles }: { cycles: DoorCycle[] }) {
  const notable = cycles.filter((c) => c.condition !== "normal")
  return (
    <div>
      <PanelTitle
        title="Door Cycle Timeline"
        hint="Each square is one open/close cycle, in time order. Hover for its resistance reading."
      />
      <div className="mt-4 flex flex-wrap gap-1.5" role="list" aria-label="Door cycles">
        {cycles.map((c) => {
          const meta = CONDITION_META[c.condition]
          return (
            <div
              key={c.index}
              role="listitem"
              title={`Cycle ${c.index} · ${c.date} ${c.start} · ${c.operation} · ${c.label} · resistance ${c.ratio.toFixed(3)} vs limit ${c.threshold}`}
              className="flex size-8 items-center justify-center rounded-md text-[10px] font-bold text-white"
              style={{ backgroundColor: meta.color }}
            >
              {c.index}
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
        {(["issue", "review", "normal"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm" style={{ backgroundColor: CONDITION_META[k].color }} />
            {k === "issue" ? "Abnormal resistance" : k === "review" ? "Normal, but close to the limit — review" : "Normal"}
          </span>
        ))}
      </div>

      {notable.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1.5 pr-3 font-semibold">Cycle</th>
                <th className="py-1.5 pr-3 font-semibold">Time</th>
                <th className="py-1.5 pr-3 font-semibold">Operation</th>
                <th className="py-1.5 pr-3 font-semibold">Resistance / limit</th>
                <th className="py-1.5 pr-3 font-semibold">Confidence</th>
                <th className="py-1.5 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody>
              {notable.map((c) => {
                const meta = CONDITION_META[c.condition]
                return (
                  <tr key={c.index} className="border-t border-border">
                    <td className="py-1.5 pr-3 font-semibold text-slate-800">#{c.index}</td>
                    <td className="py-1.5 pr-3 text-slate-600">
                      {c.date} {c.start}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-600">{c.operation}</td>
                    <td className="py-1.5 pr-3 text-slate-600">
                      {c.ratio.toFixed(3)} / {c.threshold}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-600">{c.confidence}</td>
                    <td className="py-1.5 font-bold" style={{ color: meta.color }}>
                      {c.label}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500">
        Resistance = motor current ÷ motor back-EMF (load per unit speed). A cycle is abnormal when it exceeds the limit
        for its operation (open or close).
      </p>
    </div>
  )
}
