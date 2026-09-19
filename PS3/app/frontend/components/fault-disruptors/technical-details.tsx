"use client"

import { ChevronDown } from "lucide-react"

/** Collapsible "how was this computed" panel, driven by the API's technical_details. */
export function TechnicalDetails({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details)
  if (entries.length === 0) return null
  return (
    <details className="group mt-4 rounded-xl border border-border bg-slate-50/60 px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-700">
        Technical details
        <ChevronDown className="size-4 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-[max-content_1fr]">
        {entries.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="font-semibold text-slate-500">{key.replace(/_/g, " ")}</dt>
            <dd className="break-words text-slate-700">
              {typeof value === "object" && value !== null ? JSON.stringify(value) : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
