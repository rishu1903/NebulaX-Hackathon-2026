"use client"

import { ConditionIcon } from "@/components/fault-disruptors/condition-icon"
import { CONDITION_META, type Condition } from "@/lib/fault-disruptors/data"

export type Kpi = { label: string; value: string; condition: Condition }

export function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((k) => {
        const meta = CONDITION_META[k.condition]
        const emphasized = k.condition === "issue" || k.condition === "review"
        return (
          <div
            key={k.label}
            className="rounded-xl border bg-white p-3.5"
            style={{ borderColor: emphasized ? meta.color : "var(--border)" }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{k.label}</p>
            <div className="mt-1 flex items-center gap-1.5">
              {emphasized && (
                <span style={{ color: meta.color }}>
                  <ConditionIcon condition={k.condition} className="size-4" />
                </span>
              )}
              <span
                className="text-base font-bold"
                style={{ color: emphasized ? meta.color : "#0f172a" }}
              >
                {k.value}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
