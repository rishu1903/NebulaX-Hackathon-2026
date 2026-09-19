"use client"

import { CheckCircle2, CircleAlert, FileText, Loader2, Trash2 } from "lucide-react"
import type { AnalysisJob } from "@/lib/fault-disruptors/workspace"

export function BatchQueue({ jobs, activeId, onSelect, onRemove }: {
  jobs: AnalysisJob[]
  activeId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}) {
  if (jobs.length === 0) return null

  const visibleJob = jobs.find((job) => job.id === activeId) ?? jobs[0]

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Analysis queue</p>
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
            {jobs.length} file{jobs.length === 1 ? "" : "s"}
          </span>
        </div>
        {jobs.length > 1 && (
          <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
            Showing
            <select
              value={visibleJob.id}
              onChange={(event) => onSelect(event.target.value)}
              className="max-w-52 rounded-md border border-border bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400"
              aria-label="Choose a file result to display"
            >
              {jobs.map((job) => <option key={job.id} value={job.id}>{job.fileName}</option>)}
            </select>
          </label>
        )}
      </div>
      <div>
        <div className="flex items-center gap-2 bg-white px-3 py-2">
          <button type="button" onClick={() => onSelect(visibleJob.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              {visibleJob.status === "running" ? <Loader2 className="size-4 shrink-0 animate-spin text-blue-600" />
                : visibleJob.status === "complete" ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                  : visibleJob.status === "error" ? <CircleAlert className="size-4 shrink-0 text-red-600" />
                    : <FileText className="size-4 shrink-0 text-slate-400" />}
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold text-slate-800">{visibleJob.fileName}</span>
                <span className="block truncate text-[11px] text-slate-500">
                  {visibleJob.error ?? visibleJob.status}{jobs.length > 1 ? ` · ${jobs.length - 1} more in batch` : ""}
                </span>
              </span>
            </button>
            {visibleJob.status !== "running" && (
              <button type="button" aria-label={`Remove ${visibleJob.fileName}`} onClick={() => onRemove(visibleJob.id)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-50 hover:text-red-600">
                <Trash2 className="size-3.5" />
              </button>
            )}
        </div>
      </div>
    </div>
  )
}
