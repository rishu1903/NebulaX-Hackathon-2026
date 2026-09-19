"use client"

import { AlertTriangle, CheckCircle2, Gauge, MapPinned, Route, ShieldCheck } from "lucide-react"
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
      <PanelTitle
        title="Rail Corrugation Assessment"
        hint="The model classifies the uploaded recording as Normal, Side I or Side II. The result applies to the recording window as a whole."
      />

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)]">
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: meta.color, backgroundColor: meta.soft }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex size-11 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: meta.color, color: "#ffffff" }}
            >
              {side ? (
                <AlertTriangle className="size-5" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-5" aria-hidden="true" />
              )}
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                Model classification
              </p>
              <p className="mt-1 text-2xl font-bold tracking-tight" style={{ color: meta.color }}>
                {side ? `Side ${side} corrugation` : label || "Normal"}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                {side
                  ? `The uploaded recording is classified as showing corrugation on Side ${side}.`
                  : "The uploaded recording is classified as normal, with no rail side flagged for corrugation."}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-slate-50 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <MapPinned className="size-3.5" aria-hidden="true" />
            Scope of result
          </p>
          <p className="mt-2 text-sm font-bold text-slate-900">Uploaded recording window</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            This classification identifies the affected rail side for the complete uploaded window. It does not
            identify an exact defect start or end position within that window.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <MetricCard
          icon={<Gauge className="size-4" aria-hidden="true" />}
          label="Mean train speed"
          value={speedKmh === null ? "Not available" : `${speedKmh.toFixed(1)} km/h`}
          description="Average speed measured for the uploaded recording."
        />

        <MetricCard
          icon={<Route className="size-4" aria-hidden="true" />}
          label="Speed transitions"
          value={speedChanges === null ? "Not available" : String(speedChanges)}
          description="Number of speed-state transitions detected in the recording."
        />
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[1fr_120px] gap-4 border-b border-border bg-slate-50 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <span>Rail side</span>
          <span className="text-right">Assessment</span>
        </div>

        <RailSideRow
          title="Side I"
          active={side === "I"}
          normal={side !== "I"}
        />

        <RailSideRow
          title="Side II"
          active={side === "II"}
          normal={side !== "II"}
        />
      </div>

      {lowMotion && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-amber-900">Low-motion rule applied</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
              The recording contained very little speed-state movement, so the Rail pipeline applied its
              low-transition override. This is part of the model&apos;s normal inference logic for low-motion inputs.
            </p>
          </div>
        </div>
      )}

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Suggested technician check
        </p>

        {side ? (
          <>
            <p className="mt-1 text-sm font-bold text-slate-900">
              Inspect Side {side} within the track segment represented by this recording.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Use a physical rail inspection or maintenance measurement to localise the exact treatment area and
              determine any grinding or repair parameters. Those details are not predicted by this classifier.
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm font-bold text-slate-900">
              No corrugation follow-up is indicated by this recording.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Continue routine monitoring and review future recordings for any change in rail condition.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function RailSideRow({
  title,
  active,
  normal,
}: {
  title: string
  active: boolean
  normal: boolean
}) {
  const condition: Condition = active ? "issue" : normal ? "normal" : "neutral"
  const meta = CONDITION_META[condition]

  return (
    <div className="grid grid-cols-[1fr_120px] items-center gap-4 border-b border-border bg-white px-4 py-3 last:border-b-0">
      <div>
        <p className="text-sm font-bold text-slate-800">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {active ? "Flagged by the model for corrugation." : "Not flagged in this recording."}
        </p>
      </div>

      <span
        className="justify-self-end rounded-md px-2.5 py-1 text-xs font-bold"
        style={{ backgroundColor: meta.soft, color: meta.color }}
      >
        {active ? "Corrugation" : "Not flagged"}
      </span>
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  description,
}: {
  icon: React.ReactNode
  label: string
  value: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
    </div>
  )
}
