"use client"

import { useState } from "react"
import { ConditionIcon } from "@/components/fault-disruptors/condition-icon"
import { CONDITION_META, DOOR_CYCLES } from "@/lib/fault-disruptors/data"
import { PanelTitle } from "./panel-acv"

export function PanelDoor() {
  const [selected, setSelected] = useState<number | null>(18)
  const active = DOOR_CYCLES.find((c) => c.index === selected) ?? null

  return (
    <div>
      <PanelTitle title="Saloon Door Cycle Timeline" hint="38 evaluated cycles · click a cycle to inspect resistance" />

      <div className="mt-4 flex flex-wrap gap-1.5">
        {DOOR_CYCLES.map((c) => {
          const meta = CONDITION_META[c.condition]
          const isSel = c.index === selected
          return (
            <button
              key={c.index}
              type="button"
              onClick={() => setSelected(c.index)}
              title={`Cycle ${c.index}`}
              className="h-9 flex-1 min-w-[14px] rounded-sm transition-transform hover:scale-y-110"
              style={{
                backgroundColor: c.condition === "normal" ? "#e2e8f0" : meta.color,
                outline: isSel ? `2px solid ${meta.color}` : "none",
                outlineOffset: 2,
              }}
              aria-label={`Cycle ${c.index}, ${meta.label}`}
            />
          )
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-slate-400">
        <span>Cycle 01</span>
        <span>Cycle 38</span>
      </div>

      {active && (
        <div
          className="mt-4 rounded-lg border p-3"
          style={{
            borderColor: CONDITION_META[active.condition].color,
            backgroundColor: CONDITION_META[active.condition].soft,
          }}
        >
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-slate-900">Cycle {active.index}</span>
            <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: CONDITION_META[active.condition].color }}>
              <ConditionIcon condition={active.condition} />
              {CONDITION_META[active.condition].label}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-slate-600">
            <div>
              <span className="block text-slate-400">Cycle Duration</span>
              <span className="font-semibold text-slate-800">{active.durationMs} ms</span>
            </div>
            <div>
              <span className="block text-slate-400">Contact Resistance</span>
              <span className="font-semibold text-slate-800">{active.resistance}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
