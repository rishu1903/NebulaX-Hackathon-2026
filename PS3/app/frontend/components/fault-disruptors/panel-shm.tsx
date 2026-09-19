"use client"

import { Activity, Binary, Sigma, Waves } from "lucide-react"
import { CONDITION_META, type Condition } from "@/lib/fault-disruptors/data"
import { SHM_BANDS } from "@/lib/fault-disruptors/live"
import { PanelTitle } from "@/components/fault-disruptors/panel-acv"

export function PanelShm({
  damage,
  condition,
  showcaseLocation,
}: {
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
        title="Cumulative Fatigue Damage"
        hint="Numeric regression output for the uploaded structural stress signal."
      />

      {showcaseLocation && (
        <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
          <strong>Showcase location: {showcaseLocation}.</strong> This marker demonstrates an inspection workflow; the prediction applies to the uploaded record as a whole and does not localise structural damage.
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)]">
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: meta.color, backgroundColor: meta.soft }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Predicted cumulative damage
          </p>

          <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className="text-5xl font-bold tracking-tight" style={{ color: meta.color }}>
              {damage.toFixed(4)}
            </span>
            <span className="pb-1 text-sm font-semibold text-slate-500">Damage index D</span>
          </div>

          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
            Higher values indicate greater accumulated fatigue damage in the uploaded structural record.
            This is a single numeric prediction for the full signal.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-slate-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Prediction type
          </p>
          <p className="mt-1 text-xl font-bold text-slate-950">Physics-informed regression</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            The model predicts cumulative damage from fatigue cycles extracted across the complete stress signal.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Damage reference scale
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              D = 1.0 is shown as the Miner&apos;s-rule reference point.
            </p>
          </div>

          <span
            className="rounded-full px-2.5 py-1 text-xs font-bold"
            style={{ backgroundColor: meta.soft, color: meta.color }}
          >
            {damageBandLabel(damage)}
          </span>
        </div>

        <div className="relative mt-5 h-6 overflow-hidden rounded-md bg-slate-100">
          <div
            className="h-full rounded-md transition-all duration-700"
            style={{
              width: `${boundedFill}%`,
              backgroundColor: meta.color,
            }}
          />

          {[SHM_BANDS.review, SHM_BANDS.issue].map((threshold) => (
            <div
              key={threshold}
              className="absolute top-0 h-full w-px bg-slate-400/70"
              style={{ left: `${threshold * 100}%` }}
            />
          ))}

          <div className="absolute right-0 top-0 h-full w-0.5 bg-slate-700" />
        </div>

        <div className="relative mt-1 h-5 text-[11px] text-slate-500">
          <span className="absolute left-0">0</span>
          <span
            className="absolute -translate-x-1/2"
            style={{ left: `${SHM_BANDS.review * 100}%` }}
          >
            {SHM_BANDS.review}
          </span>
          <span
            className="absolute -translate-x-1/2"
            style={{ left: `${SHM_BANDS.issue * 100}%` }}
          >
            {SHM_BANDS.issue}
          </span>
          <span className="absolute right-0 font-semibold text-slate-700">1.0 reference</span>
        </div>

        {aboveReference && (
          <p className="mt-2 text-xs font-semibold" style={{ color: meta.color }}>
            The predicted value is at or above the D = 1.0 reference point.
          </p>
        )}

        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          The 0.5 and 0.8 colour transitions are interface display bands used to make the result easier to scan.
          They are not additional SHM model classes.
        </p>
      </div>

      <div className="mt-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
          How the prediction is produced
        </p>

        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <MethodStep
            icon={<Waves className="size-4" aria-hidden="true" />}
            step="1"
            title="Stress signal"
            text="Use the complete uploaded structural time series."
          />
          <MethodStep
            icon={<Activity className="size-4" aria-hidden="true" />}
            step="2"
            title="Rainflow cycles"
            text="Convert the irregular stress history into fatigue load cycles."
          />
          <MethodStep
            icon={<Sigma className="size-4" aria-hidden="true" />}
            step="3"
            title="Fatigue feature"
            text="Weight cycle count by stress range raised to the fifth power."
          />
          <MethodStep
            icon={<Binary className="size-4" aria-hidden="true" />}
            step="4"
            title="Regression"
            text="Apply the calibrated coefficient to predict cumulative damage."
          />
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Suggested engineering check
        </p>
        <p className="mt-1 text-sm font-bold text-slate-900">
          Review the predicted damage value together with the asset&apos;s maintenance history and applicable engineering criteria.
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          If the result warrants follow-up, use a physical structural inspection to determine the location and nature of
          any damage. The SHM prediction itself does not localise a defect.
        </p>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Scope of result
        </p>
        <p className="mt-1 text-sm font-bold text-slate-900">
          This prediction applies to the uploaded structural record as a whole.
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          The SHM model estimates cumulative fatigue damage only. It does not identify a carriage, body zone,
          bogie location, crack position or other physical damage location.
        </p>
      </div>
    </div>
  )
}

function MethodStep({
  icon,
  step,
  title,
  text,
}: {
  icon: React.ReactNode
  step: string
  title: string
  text: string
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-3">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white">
          {step}
        </span>
        <span className="text-slate-500">{icon}</span>
      </div>
      <p className="mt-3 text-sm font-bold text-slate-900">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{text}</p>
    </div>
  )
}

function damageBandLabel(damage: number) {
  if (damage >= 1) return "At / above D = 1.0"
  if (damage >= SHM_BANDS.issue) return "Near reference"
  if (damage >= SHM_BANDS.review) return "Elevated"
  return "Lower relative damage"
}
