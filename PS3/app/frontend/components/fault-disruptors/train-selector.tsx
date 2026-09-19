"use client"

import { TrainFront } from "lucide-react"
import { DEMO_TRAINS, type DemoTrain } from "@/lib/fault-disruptors/data"

export function TrainSelector({ value, onChange }: { value: DemoTrain; onChange: (train: DemoTrain) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-slate-50 px-2 py-1.5">
      <TrainFront className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
      <label className="sr-only" htmlFor="showcase-train">Showcase train</label>
      <select
        id="showcase-train"
        value={value}
        onChange={(event) => onChange(event.target.value as DemoTrain)}
        className="h-8 rounded-md border border-border bg-white px-2 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
      >
        {DEMO_TRAINS.map((train) => <option key={train}>{train}</option>)}
      </select>
      <span className="hidden text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:inline">Showcase</span>
    </div>
  )
}
