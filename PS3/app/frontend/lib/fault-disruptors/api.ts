import type { Subsystem } from "@/lib/fault-disruptors/data"

/**
 * Base URL of the analysis API. In production it is empty (same origin: the API serves this UI, or
 * Firebase Hosting rewrites /api/** to it). `next dev` runs on :3000, so it defaults to the local
 * FastAPI server on :8000. Override with NEXT_PUBLIC_API_BASE.
 */
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "")

const ROUTE: Record<Subsystem, string> = { ACV: "acv", DOOR: "door", RAIL: "rail", SHM: "shm" }

/** Official submission file name for each subsystem. */
export const DOWNLOAD_NAME: Record<Subsystem, string> = {
  ACV: "acv_predictions.csv",
  DOOR: "door_predictions.csv",
  RAIL: "rail_predictions.csv",
  SHM: "shm_predictions.csv",
}

/** The result contract every subsystem adapter returns (see PS3/app/adapters). */
export type AnalyseResult = {
  subsystem: string
  success: boolean
  filename: string
  headline: string
  prediction: unknown
  summary: Record<string, any>
  table: Record<string, any>[]
  chart_data: unknown
  technical_details: Record<string, any>
  submission_csv: string | null
  error: string | null
}

export class ApiError extends Error {}

export async function analyse(subsystem: Subsystem, file: File): Promise<AnalyseResult> {
  const body = new FormData()
  body.append("file", file)

  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/analyse/${ROUTE[subsystem]}`, { method: "POST", body })
  } catch {
    throw new ApiError("Could not reach the analysis service. Please check your connection and try again.")
  }

  const text = await response.text()
  let data: any = null
  try {
    data = JSON.parse(text)
  } catch {
    /* non-JSON error body (e.g. a proxy error page) */
  }

  if (response.ok && data) return data as AnalyseResult

  const detail = data?.error ?? data?.detail
  const message =
    typeof detail === "string" && detail
      ? detail
      : detail
        ? JSON.stringify(detail)
        : `Analysis failed (HTTP ${response.status}).`
  throw new ApiError(message)
}

/** Save the adapter's submission CSV in the browser. */
export function downloadCsv(subsystem: Subsystem, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = DOWNLOAD_NAME[subsystem]
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
