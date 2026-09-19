"use client"

import { CONDITION_META, type Condition } from "@/lib/fault-disruptors/data"
import { PanelTitle } from "@/components/fault-disruptors/panel-acv"

export function PanelRail({
  label,
  side,
  speedKmh,
  speedChanges,
  lowMotion,
}: {
  label: string
  side: "I" | "II" | null
  speedKmh: number | null
  speedChanges: number | null
  lowMotion: boolean
}) {
  const condition: Condition = side ? "issue" : "normal"
  const meta = CONDITION_META[condition]
  return (
    <div>
      <PanelTitle title="Rail Corrugation Result" hint="Classification of the recorded 1-second track window" />
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border p-4" style={{ borderColor: meta.color, backgroundColor: meta.soft }}>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Condition</p>
          <p className="mt-1 text-xl font-bold" style={{ color: meta.color }}>
            {label}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {side ? `Corrugation detected on rail ${side === "I" ? "side I" : "side II"}.` : "No corrugation detected."}
          </p>
        </div>
        <Stat label="Mean speed" value={speedKmh === null ? "—" : `${speedKmh.toFixed(1)} km/h`} />
        <Stat label="Speed changes in window" value={speedChanges === null ? "—" : String(speedChanges)} />
      </div>
      {lowMotion && (
        <p className="mt-3 text-xs text-slate-500">
          The train was almost stationary in this window, so the model applied its low-motion rule.
        </p>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  )
}
