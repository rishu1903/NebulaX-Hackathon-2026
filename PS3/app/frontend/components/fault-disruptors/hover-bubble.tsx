"use client"

import { ConditionIcon } from "@/components/fault-disruptors/condition-icon"
import { CONDITION_META, type CarState } from "@/lib/fault-disruptors/data"

export function HoverBubble({ car, leftFraction }: { car: CarState; leftFraction: number }) {
  const meta = CONDITION_META[car.condition]
  const priority = car.rank ? ` · Priority #${car.rank}` : ""

  return (
    <div
      className="pointer-events-none absolute z-20 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-1 duration-200"
      style={{ left: `${leftFraction * 100}%`, top: "0.75rem" }}
    >
      <div className="w-56 rounded-xl border border-border bg-white p-3 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900">{car.label}</span>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ backgroundColor: meta.soft, color: meta.color }}
          >
            <ConditionIcon condition={car.condition} className="size-3.5" /> {meta.label}
          </span>
        </div>
        <p className="mt-1.5 text-xs leading-snug text-slate-600">
          {car.finding}
          {priority}
        </p>
      </div>
      <div className="mx-auto h-3 w-3 -translate-y-1.5 rotate-45 border-b border-r border-border bg-white" />
    </div>
  )
}
