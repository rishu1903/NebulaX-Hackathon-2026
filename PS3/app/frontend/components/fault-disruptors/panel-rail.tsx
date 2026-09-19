"use client"

import { AlertTriangle, CheckCircle2, Gauge, MapPinned, Route, ShieldCheck } from "lucide-react"
import { CONDITION_META, type Condition } from "@/lib/fault-disruptors/data"
import { PanelTitle } from "@/components/fault-disruptors/panel-acv"
import type { RailHotspot } from "@/lib/fault-disruptors/live"

export function PanelRail({
  label,
  side,
  speedKmh,
  speedChanges,
  distanceM,
  hotspot,
  filename,
  lowMotion,
}: {
  label: string
  side: "I" | "II" | null
  speedKmh: number | null
  speedChanges: number | null
  distanceM: number | null
  hotspot: RailHotspot | null
  filename: string
  lowMotion: boolean
}) {
  const condition: Condition = side ? "issue" : "normal"
  const meta = CONDITION_META[condition]

  return (
    <div>
      <PanelTitle
        title="Track Window & Inspection Guidance"
        hint="Measured context for the uploaded recording, followed by the rail side that should be inspected."
      />

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="rounded-xl border p-4" style={{ borderColor: meta.color, backgroundColor: meta.soft }}>
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: meta.color }}>
              {side ? <AlertTriangle className="size-5" aria-hidden="true" /> : <CheckCircle2 className="size-5" aria-hidden="true" />}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Model verdict</p>
              <p className="mt-1 text-2xl font-bold tracking-tight" style={{ color: meta.color }}>
                {side ? `Inspect Side ${side}` : label || "Normal"}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                {side
                  ? hotspot
                    ? `Corrugation is classified on Side ${side}; the strongest signal region is estimated at ${hotspot.startM.toFixed(2)}–${hotspot.endM.toFixed(2)} m.`
                    : `Corrugation is classified on Side ${side} for the measured window.`
                  : "Neither rail side is flagged for corrugation in this measured window."}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-slate-50 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <MapPinned className="size-3.5" aria-hidden="true" /> Recorded window
          </p>
          <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">File</dt><dd className="truncate text-right font-bold text-slate-900">{filename}</dd>
            <dt className="text-slate-500">Distance</dt><dd className="text-right font-bold text-slate-900">{distanceM === null ? "Not available" : `${distanceM.toFixed(2)} m`}</dd>
            <dt className="text-slate-500">Mean speed</dt><dd className="text-right font-bold text-slate-900">{speedKmh === null ? "Not available" : `${speedKmh.toFixed(1)} km/h`}</dd>
          </dl>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <RailSideCard title="Left Rail · Side I" active={side === "I"} />
        <RailSideCard title="Right Rail · Side II" active={side === "II"} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-white px-4 py-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-2"><Route className="size-4 text-slate-400" />{speedChanges === null ? "Transition count unavailable" : `${speedChanges} wheel-pulse transitions`}</span>
        <span className="inline-flex items-center gap-2"><Gauge className="size-4 text-slate-400" />Distance uses 0.014835 m per transition</span>
        <span className="inline-flex items-center gap-2"><MapPinned className="size-4 text-slate-400" />{hotspot ? `Peak local energy ${hotspot.peakToMedianEnergy.toFixed(2)}× window median` : "No abnormal hotspot estimated"}</span>
      </div>

      {lowMotion && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-amber-900">Low-motion rule applied</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-800">Very little wheel movement was recorded, so the pipeline applied its low-transition override.</p>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Recommended next check</p>
        <p className="mt-1 text-sm font-bold text-slate-900">
          {side && hotspot
            ? `Prioritise Side ${side} from ${hotspot.startM.toFixed(2)} m to ${hotspot.endM.toFixed(2)} m within the recording.`
            : side
              ? `Inspect Side ${side} across the ${distanceM === null ? "uploaded" : `${distanceM.toFixed(2)} m`} recording window.`
              : "Continue routine monitoring; no corrugation follow-up is indicated by this recording."}
        </p>
        {side && <p className="mt-1 text-xs leading-relaxed text-slate-500">The highlighted interval is an energy-based estimate derived from wheel-pulse distance and local sensor energy. Confirm treatment limits with a physical rail measurement.</p>}
      </div>
    </div>
  )
}

function RailSideCard({ title, active }: { title: string; active: boolean }) {
  const meta = CONDITION_META[active ? "issue" : "normal"]
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3" style={{ borderColor: active ? meta.color : "var(--border)" }}>
      <div>
        <p className="text-sm font-bold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{active ? "Flagged for inspection" : "Not flagged in this recording"}</p>
      </div>
      <span className="rounded-md px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: meta.soft, color: meta.color }}>{active ? "Corrugation" : "Clear"}</span>
    </div>
  )
}
