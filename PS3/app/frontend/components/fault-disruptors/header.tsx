"use client"

import { CheckCircle2, FileUp, Loader2, ShieldCheck } from "lucide-react"
import { TrainSelector } from "@/components/fault-disruptors/train-selector"
import type { DemoTrain } from "@/lib/fault-disruptors/data"

export function Header({
  reportFileName,
  isAnalyzing,
  analysisComplete,
  selectedTrain,
  onTrainChange,
}: {
  reportFileName: string | null
  isAnalyzing: boolean
  analysisComplete: boolean
  selectedTrain: DemoTrain
  onTrainChange: (train: DemoTrain) => void
}) {
  return (
    <header className="border-b border-border bg-white">
      <div className="flex flex-col gap-3 px-4 py-3 md:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6Z"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path d="M4 10h16" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="8" cy="14" r="1.4" fill="currentColor" />
              <circle cx="16" cy="14" r="1.4" fill="currentColor" />
              <path
                d="M7 18l-2 4M17 18l2 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">FAULT DISRUPTORS</h1>
            <p className="text-xs text-slate-500">
              Condition-monitoring decision support for train maintenance teams.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <TrainSelector value={selectedTrain} onChange={onTrainChange} />

            {reportFileName && (
              <div className="hidden min-w-0 items-center gap-1.5 text-xs font-medium text-slate-500 sm:flex">
                {isAnalyzing ? (
                  <Loader2 className="size-3.5 animate-spin text-slate-500" aria-hidden="true" />
                ) : analysisComplete ? (
                  <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden="true" />
                ) : (
                  <FileUp className="size-3.5 text-slate-400" aria-hidden="true" />
                )}
                <span className="max-w-44 truncate">{reportFileName}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-1.5 text-[11px] text-slate-500 md:px-6">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-slate-600" aria-hidden="true" />
        <span>
          Decision-support tool: predictions and suggested checks support inspection planning and do not replace
          professional maintenance or engineering inspection.
        </span>
      </div>
    </header>
  )
}
