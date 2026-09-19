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

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border bg-slate-50 px-3 py-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Analysis queue</p>
        <span className="text-xs font-semibold text-slate-500">{jobs.length} file{jobs.length === 1 ? "" : "s"}</span>
      </div>
      <div className="max-h-64 divide-y divide-border overflow-y-auto">
        {jobs.map((job) => (
          <div key={job.id} className={job.id === activeId ? "flex items-center gap-2 bg-slate-50 px-3 py-2" : "flex items-center gap-2 px-3 py-2"}>
            <button type="button" onClick={() => onSelect(job.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              {job.status === "running" ? <Loader2 className="size-4 shrink-0 animate-spin text-blue-600" />
                : job.status === "complete" ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                  : job.status === "error" ? <CircleAlert className="size-4 shrink-0 text-red-600" />
                    : <FileText className="size-4 shrink-0 text-slate-400" />}
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold text-slate-800">{job.fileName}</span>
                <span className="block truncate text-[11px] text-slate-500">{job.error ?? job.status}</span>
              </span>
            </button>
            {job.status !== "running" && (
              <button type="button" aria-label={`Remove ${job.fileName}`} onClick={() => onRemove(job.id)} className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-red-600">
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
