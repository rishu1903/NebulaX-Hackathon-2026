"use client"

import { Activity, Binary, ChevronDown, MapPinned, Sigma, Waves } from "lucide-react"
import { CONDITION_META, type Condition } from "@/lib/fault-disruptors/data"
import { SHM_BANDS } from "@/lib/fault-disruptors/live"
import { PanelTitle } from "@/components/fault-disruptors/panel-acv"

export function PanelShm({ damage, condition, showcaseLocation }: {
  damage: number
  condition: Condition
  showcaseLocation?: string | null
}) {
  const meta = CONDITION_META[condition]
  const boundedFill = Math.min(1, Math.max(0, damage)) * 100
  const aboveReference = damage >= 1

  return (
    <div>
      <PanelTitle
        title="Fatigue Damage & Engineering Context"
        hint="One regression value for the complete uploaded structural record. The train location is a labelled showcase context."
      />

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <div className="rounded-xl border bg-white p-5" style={{ borderColor: meta.color }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Predicted cumulative damage</p>
              <div className="mt-1 flex items-end gap-2">
                <span className="text-5xl font-bold tracking-tight" style={{ color: meta.color }}>{damage.toFixed(4)}</span>
                <span className="pb-1 text-sm font-semibold text-slate-500">Damage index D</span>
              </div>
            </div>
            <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: meta.soft, color: meta.color }}>{damageBandLabel(damage)}</span>
          </div>

          <div className="relative mt-6 h-5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${boundedFill}%`, backgroundColor: meta.color }} />
            {[SHM_BANDS.review, SHM_BANDS.issue].map((threshold) => <div key={threshold} className="absolute top-0 h-full w-px bg-slate-500/60" style={{ left: `${threshold * 100}%` }} />)}
            <div className="absolute right-0 top-0 h-full w-0.5 bg-slate-800" />
          </div>
          <div className="relative mt-1 h-5 text-[11px] text-slate-500">
            <span className="absolute left-0">0</span>
            <span className="absolute -translate-x-1/2" style={{ left: `${SHM_BANDS.review * 100}%` }}>0.5</span>
            <span className="absolute -translate-x-1/2" style={{ left: `${SHM_BANDS.issue * 100}%` }}>0.8</span>
            <span className="absolute right-0 font-semibold text-slate-700">1.0 reference</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            The 0.5 and 0.8 marks are display bands for scanability; they are not additional model classes.{aboveReference ? " This result is at or above the D = 1.0 reference." : ""}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-slate-50 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500"><MapPinned className="size-3.5" />Result scope</p>
          <p className="mt-2 text-lg font-bold text-slate-950">Complete structural record</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">The model estimates cumulative damage and does not identify a carriage, crack, bogie or body zone.</p>
          {showcaseLocation && (
            <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700">Showcase asset context</p>
              <p className="mt-0.5 text-sm font-bold text-violet-950">{showcaseLocation}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-violet-800">Interface demonstration only; not localised by the model.</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Engineering interpretation</p>
          <p className="mt-1 text-sm font-bold text-slate-900">{damageBandSummary(damage)}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Review this value against asset history and the engineering criteria used by the operator.</p>
        </div>
        <div className="rounded-xl border border-border bg-slate-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Recommended next check</p>
          <p className="mt-1 text-sm font-bold text-slate-900">Inspect the physical structure if the damage estimate warrants follow-up.</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Use inspection findings to determine the actual location and nature of damage.</p>
        </div>
      </div>

      <details className="group mt-4 rounded-xl border border-border bg-white px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-slate-800">
          How the physics-informed prediction is produced
          <ChevronDown className="size-4 text-slate-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <MethodStep icon={<Waves className="size-4" />} step="1" title="Stress signal" text="Use the complete uploaded structural time series." />
          <MethodStep icon={<Activity className="size-4" />} step="2" title="Rainflow cycles" text="Convert the stress history into fatigue load cycles." />
          <MethodStep icon={<Sigma className="size-4" />} step="3" title="Fatigue feature" text="Weight cycle count by stress range to the fifth power." />
          <MethodStep icon={<Binary className="size-4" />} step="4" title="Regression" text="Apply the calibrated coefficient to estimate damage." />
        </div>
      </details>
    </div>
  )
}

function MethodStep({ icon, step, title, text }: { icon: React.ReactNode; step: string; title: string; text: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><div className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white">{step}</span><span className="text-slate-500">{icon}</span></div><p className="mt-2 text-sm font-bold text-slate-900">{title}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{text}</p></div>
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
