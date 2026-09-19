"use client"

import { Activity, Binary, ChevronDown, ClipboardCheck, FileChartColumn, Sigma, Waves } from "lucide-react"
import { CONDITION_META, type Condition } from "@/lib/fault-disruptors/data"
import { SHM_BANDS, type ShmSignalPoint } from "@/lib/fault-disruptors/live"
import { PanelTitle } from "@/components/fault-disruptors/panel-acv"

export function PanelShm({ damage, condition, signal, sampleCount }: {
  damage: number
  condition: Condition
  signal: ShmSignalPoint[]
  sampleCount: number | null
}) {
  const meta = CONDITION_META[condition]
  const boundedFill = Math.min(1, Math.max(0, damage)) * 100

  return (
    <div>
      <PanelTitle
        title="Structural Fatigue Damage"
        hint="This uploaded structural signal produced one cumulative fatigue-damage estimate for the complete record."
      />

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.28fr)]">
        <section className="rounded-xl border bg-white p-5" style={{ borderColor: meta.color }} aria-label="Cumulative damage result">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Predicted cumulative damage</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-6xl font-bold tracking-tight" style={{ color: meta.color }}>{damage.toFixed(4)}</span>
                <span className="pb-2 text-sm font-semibold text-slate-500">D</span>
              </div>
            </div>
            <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: meta.soft, color: meta.color }}>{damageBandLabel(damage)}</span>
          </div>

          <div className="mt-7" role="img" aria-label={`Cumulative damage D ${damage.toFixed(4)} on a display scale from zero to the D equals one reference`}>
            <div className="relative h-6 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${boundedFill}%`, backgroundColor: meta.color }} />
              {[SHM_BANDS.review, SHM_BANDS.issue].map((threshold) => <div key={threshold} className="absolute top-0 h-full w-px bg-slate-500/60" style={{ left: `${threshold * 100}%` }} />)}
              <div className="absolute right-0 top-0 h-full w-0.5 bg-slate-800" />
            </div>
            <div className="relative mt-1 h-5 text-[11px] text-slate-500">
              <span className="absolute left-0">0</span>
              <span className="absolute -translate-x-1/2" style={{ left: `${SHM_BANDS.review * 100}%` }}>0.5</span>
              <span className="absolute -translate-x-1/2" style={{ left: `${SHM_BANDS.issue * 100}%` }}>0.8</span>
              <span className="absolute right-0 font-semibold text-slate-700">D = 1.0 reference</span>
            </div>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            The 0.5 and 0.8 marks are display bands for scanability. They are not additional model classes or operator intervention limits.
          </p>
        </section>

        <section className="rounded-xl border border-border bg-white p-4" aria-label="Uploaded structural signal">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500"><FileChartColumn className="size-3.5" />Uploaded structural signal</p>
              <p className="mt-1 text-sm font-bold text-slate-900">Raw signal values across the complete record</p>
            </div>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{sampleCount === null ? "Downsampled preview" : `${sampleCount.toLocaleString()} samples`}</span>
          </div>
          <SignalChart points={signal} sampleCount={sampleCount} />
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            This chart shows the uploaded stress record used for inference. The model prediction is derived from the full signal. Values are shown in their uploaded scale because the dataset does not define a display unit.
          </p>
        </section>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <SupportCard
          icon={<Waves className="size-4" />}
          title="Result scope"
          lead="Complete structural record"
          text="The model estimates cumulative fatigue damage for the full uploaded signal. It does not identify a carriage, crack, bogie or body zone."
        />
        <SupportCard
          icon={<Activity className="size-4" />}
          title="Engineering interpretation"
          lead={damageBandSummary(damage)}
          text="Review this value against asset history and the engineering criteria used by the operator."
        />
        <SupportCard
          icon={<ClipboardCheck className="size-4" />}
          title="Recommended next check"
          lead="Inspect the physical structure if the estimate warrants follow-up."
          text="The model supports inspection planning. Physical inspection determines the actual location and nature of any damage."
        />
      </div>

      <details className="group mt-4 rounded-xl border border-border bg-white px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-slate-800">
          How the physics-informed prediction is produced
          <ChevronDown className="size-4 text-slate-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <MethodStep icon={<Waves className="size-4" />} step="1" title="Stress signal" text="Use the complete uploaded structural time series." />
          <MethodStep icon={<Activity className="size-4" />} step="2" title="Rainflow cycles" text="Convert the stress history into fatigue load cycles." />
          <MethodStep icon={<Sigma className="size-4" />} step="3" title="Fatigue feature" text="Weight cycle count using stress range⁵." />
          <MethodStep icon={<Binary className="size-4" />} step="4" title="Regression model" text="Output one cumulative damage estimate D." />
        </div>
      </details>
    </div>
  )
}

function SignalChart({ points, sampleCount }: { points: ShmSignalPoint[]; sampleCount: number | null }) {
  if (points.length < 2) {
    return <div className="mt-4 flex h-48 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500">Signal preview is unavailable for this saved result. Re-upload the file to generate it.</div>
  }

  const width = 960
  const height = 220
  const left = 60
  const right = 18
  const top = 18
  const bottom = 34
  const minX = points[0].sample
  const maxX = points[points.length - 1].sample
  const values = points.map((point) => point.value)
  const minY = Math.min(...values)
  const maxY = Math.max(...values)
  const rangeX = Math.max(1, maxX - minX)
  const rangeY = Math.max(1e-12, maxY - minY)
  const x = (value: number) => left + ((value - minX) / rangeX) * (width - left - right)
  const y = (value: number) => top + ((maxY - value) / rangeY) * (height - top - bottom)
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.sample).toFixed(2)},${y(point.value).toFixed(2)}`).join(" ")
  const endSample = sampleCount === null ? maxX : sampleCount - 1

  return (
    <svg className="mt-3 h-52 w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Downsampled uploaded structural signal from sample zero to sample ${endSample}`}>
      {[0, 0.5, 1].map((fraction) => {
        const lineY = top + fraction * (height - top - bottom)
        const value = maxY - fraction * rangeY
        return <g key={fraction}><line x1={left} y1={lineY} x2={width - right} y2={lineY} stroke="#e2e8f0" strokeWidth="1" /><text x={left - 8} y={lineY + 4} textAnchor="end" fontSize="11" fill="#64748b">{formatRaw(value)}</text></g>
      })}
      <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} stroke="#94a3b8" strokeWidth="1" />
      <path d={path} fill="none" stroke="#334155" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <text x={left} y={height - 10} fontSize="11" fill="#64748b">0</text>
      <text x={width - right} y={height - 10} textAnchor="end" fontSize="11" fill="#64748b">{endSample.toLocaleString()}</text>
      <text x={(left + width - right) / 2} y={height - 10} textAnchor="middle" fontSize="11" fontWeight="600" fill="#475569">Sample index</text>
      <text x={left} y={12} fontSize="11" fontWeight="600" fill="#475569">Raw signal value · uploaded scale</text>
    </svg>
  )
}

function SupportCard({ icon, title, lead, text }: { icon: React.ReactNode; title: string; lead: string; text: string }) {
  return <section className="rounded-xl border border-border bg-slate-50 p-4"><div className="flex items-center gap-2 text-slate-500"><span className="flex size-7 items-center justify-center rounded-md bg-white">{icon}</span><p className="text-[11px] font-bold uppercase tracking-[0.16em]">{title}</p></div><p className="mt-2 text-sm font-bold text-slate-900">{lead}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{text}</p></section>
}

function MethodStep({ icon, step, title, text }: { icon: React.ReactNode; step: string; title: string; text: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><div className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white">{step}</span><span className="text-slate-500">{icon}</span></div><p className="mt-2 text-sm font-bold text-slate-900">{title}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{text}</p></div>
}

function formatRaw(value: number) {
  const magnitude = Math.abs(value)
  if ((magnitude > 0 && magnitude < 0.01) || magnitude >= 1000) return value.toExponential(2)
  return value.toFixed(magnitude >= 10 ? 1 : 3)
}

function damageBandLabel(damage: number) {
  if (damage >= 1) return "At / above reference"
  if (damage >= SHM_BANDS.issue) return "Near reference"
  if (damage >= SHM_BANDS.review) return "Elevated"
  return "Lower relative damage"
}

function damageBandSummary(damage: number) {
  if (damage >= 1) return "The prediction has reached or exceeded the D = 1.0 reference."
  if (damage >= SHM_BANDS.issue) return "The prediction is close to the D = 1.0 reference."
  if (damage >= SHM_BANDS.review) return "The prediction is elevated relative to the display scale."
  return "The prediction is in the lower portion of the display scale."
}
