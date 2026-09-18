"use client"

import { useState } from "react"
import { ConditionIcon } from "@/components/fault-disruptors/condition-icon"
import { CONDITION_META, SHM_ZONES } from "@/lib/fault-disruptors/data"
import { PanelTitle } from "./panel-acv"

// Layout coordinates for each structural zone on a single carriage cross-section.
const ZONE_RECTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  roof: { x: 40, y: 20, w: 320, h: 22 },
  front: { x: 40, y: 46, w: 96, h: 70 },
  center: { x: 140, y: 46, w: 120, h: 70 },
  rear: { x: 264, y: 46, w: 96, h: 70 },
  underframe: { x: 40, y: 120, w: 320, h: 22 },
  bogie: { x: 90, y: 146, w: 220, h: 20 },
}

export function PanelShm() {
  const issueZone = SHM_ZONES.find((z) => z.condition === "issue")
  const [selected, setSelected] = useState<string | null>(issueZone?.id ?? null)
  const active = SHM_ZONES.find((z) => z.id === selected) ?? null

  return (
    <div>
      <PanelTitle title="Structural Health — Zone Map (Car 05)" hint="Drill into a structural segment to view its strain evidence" />

      <div className="mt-4 grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <svg viewBox="0 0 400 180" className="w-full h-auto" role="img" aria-label="Carriage structural zone map">
          {SHM_ZONES.map((z) => {
            const r = ZONE_RECTS[z.id]
            const meta = CONDITION_META[z.condition]
            const isSel = z.id === selected
            const fill = z.condition === "normal" ? "#f1f5f9" : meta.soft
            return (
              <g key={z.id} onClick={() => setSelected(z.id)} style={{ cursor: "pointer" }}>
                <rect
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  rx={5}
                  fill={fill}
                  stroke={z.condition === "normal" ? "#cbd5e1" : meta.color}
                  strokeWidth={isSel ? 3 : 1.5}
                  style={{ transition: "fill 0.5s ease, stroke 0.3s ease" }}
                />
                <text
                  x={r.x + r.w / 2}
                  y={r.y + r.h / 2 + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight={600}
                  fill={z.condition === "normal" ? "#64748b" : meta.color}
                >
                  {z.label}
                </text>
              </g>
            )
          })}
        </svg>

        <div className="space-y-2">
          {active && (
            <div
              className="rounded-lg border p-3"
              style={{ borderColor: CONDITION_META[active.condition].color, backgroundColor: CONDITION_META[active.condition].soft }}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-slate-900">{active.label}</span>
                <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: CONDITION_META[active.condition].color }}>
                  <ConditionIcon condition={active.condition} />
                  {CONDITION_META[active.condition].label}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-snug text-slate-600">{active.finding}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {SHM_ZONES.map((z) => {
              const meta = CONDITION_META[z.condition]
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setSelected(z.id)}
                  className="rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor: z.id === selected ? meta.color : meta.soft,
                    color: z.id === selected ? "#fff" : meta.color,
                  }}
                >
                  {z.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
