"use client"

import { CONDITION_META, type Condition } from "@/lib/fault-disruptors/data"
import { SHM_BANDS } from "@/lib/fault-disruptors/live"
import { PanelTitle } from "@/components/fault-disruptors/panel-acv"

export function PanelShm({ damage, condition }: { damage: number; condition: Condition }) {
  const meta = CONDITION_META[condition]
  const fill = Math.min(1, Math.max(0, damage)) * 100
  return (
    <div>
      <PanelTitle
        title="Cumulative Fatigue Damage"
        hint="Predicted Miner's-rule damage for this measurement record (1.0 = fatigue failure)"
      />
      <div className="mt-4 flex items-baseline gap-3">
        <span className="text-4xl font-bold" style={{ color: meta.color }}>
          {damage.toFixed(3)}
        </span>
        <span className="text-sm font-medium text-slate-500">{(damage * 100).toFixed(1)}% of fatigue life</span>
      </div>

      <div className="relative mt-4 h-6 overflow-hidden rounded-md bg-slate-100">
        <div className="h-full rounded-md transition-all duration-700" style={{ width: `${fill}%`, backgroundColor: meta.color }} />
        {[SHM_BANDS.review, SHM_BANDS.issue].map((t) => (
          <div key={t} className="absolute top-0 h-full w-px bg-slate-400/70" style={{ left: `${t * 100}%` }} />
        ))}
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-slate-500">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${SHM_BANDS.review * 100}%` }}>
          {SHM_BANDS.review}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: `${SHM_BANDS.issue * 100}%` }}>
          {SHM_BANDS.issue}
        </span>
        <span className="absolute right-0">1.0 (failure)</span>
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Computed from the stress signal by rainflow cycle counting weighted by stress range to the fifth power. The
        colour bands (elevated from {SHM_BANDS.review}, near limit from {SHM_BANDS.issue}) are a display convention for
        how close the record is to failure.
      </p>
    </div>
  )
}
