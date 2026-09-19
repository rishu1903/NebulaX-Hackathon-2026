import type { AnalyseResult } from "@/lib/fault-disruptors/api"
import type { DemoTrain, Subsystem } from "@/lib/fault-disruptors/data"

export type JobStatus = "staged" | "running" | "complete" | "error"

export type AnalysisJob = {
  id: string
  fileName: string
  size: number
  lastModified: number
  status: JobStatus
  file?: File
  result?: AnalyseResult
  error?: string
}

export type SubsystemWorkspace = {
  jobs: AnalysisJob[]
  activeJobId: string | null
  selectedCarId: number | null
}

export type DashboardWorkspace = {
  activeSubsystem: Subsystem
  selectedTrain: DemoTrain
  workspaces: Record<Subsystem, SubsystemWorkspace>
}

export const STORAGE_KEY = "fault-disruptors-dashboard-v2"

const emptySubsystem = (): SubsystemWorkspace => ({ jobs: [], activeJobId: null, selectedCarId: null })

export function createDashboardWorkspace(): DashboardWorkspace {
  return {
    activeSubsystem: "ACV",
    selectedTrain: "T01",
    workspaces: {
      ACV: emptySubsystem(),
      DOOR: emptySubsystem(),
      RAIL: emptySubsystem(),
      SHM: emptySubsystem(),
    },
  }
}

export function fileJobId(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

/** Store completed lightweight results only. Keep the compact SHM preview so its evidence survives a reload. */
export function saveDashboardWorkspace(value: DashboardWorkspace) {
  const workspaces = Object.fromEntries(
    Object.entries(value.workspaces).map(([key, workspace]) => {
      const jobs = workspace.jobs
        .filter((job) => job.status === "complete" && job.result)
        .map((job) => ({
          ...job,
          file: undefined,
          result: { ...job.result!, chart_data: key === "SHM" ? job.result!.chart_data : null },
        }))
      return [key, { ...workspace, jobs, activeJobId: jobs.some((job) => job.id === workspace.activeJobId) ? workspace.activeJobId : jobs[0]?.id ?? null }]
    }),
  ) as DashboardWorkspace["workspaces"]

  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...value, workspaces }))
}

export function loadDashboardWorkspace(): DashboardWorkspace {
  const fallback = createDashboardWorkspace()
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return fallback

  try {
    const parsed = JSON.parse(raw) as Partial<DashboardWorkspace>
    const workspaces = { ...fallback.workspaces }
    for (const subsystem of Object.keys(workspaces) as Subsystem[]) {
      const saved = parsed.workspaces?.[subsystem]
      if (saved && Array.isArray(saved.jobs)) {
        workspaces[subsystem] = {
          jobs: saved.jobs.filter((job) => job?.status === "complete" && job?.result),
          activeJobId: saved.activeJobId ?? null,
          selectedCarId: saved.selectedCarId ?? null,
        }
      }
    }
    return {
      activeSubsystem: parsed.activeSubsystem ?? fallback.activeSubsystem,
      selectedTrain: parsed.selectedTrain ?? fallback.selectedTrain,
      workspaces,
    }
  } catch {
    return fallback
  }
}
