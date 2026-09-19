"use client"

import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Download, FileArchive, FileText, Loader2, RotateCcw, UploadCloud } from "lucide-react"
import { BatchQueue } from "@/components/fault-disruptors/batch-queue"
import { ConditionIcon } from "@/components/fault-disruptors/condition-icon"
import { Header } from "@/components/fault-disruptors/header"
import { HoverBubble } from "@/components/fault-disruptors/hover-bubble"
import { KpiStrip } from "@/components/fault-disruptors/kpi-strip"
import { PanelAcv } from "@/components/fault-disruptors/panel-acv"
import { PanelDoor } from "@/components/fault-disruptors/panel-door"
import { PanelRail } from "@/components/fault-disruptors/panel-rail"
import { PanelShm } from "@/components/fault-disruptors/panel-shm"
import { TechnicalDetails } from "@/components/fault-disruptors/technical-details"
import { carCenterFraction, TrainTwin } from "@/components/fault-disruptors/train-twin"
import { analyse, downloadCsv, downloadResultsZip, DOWNLOAD_NAME } from "@/lib/fault-disruptors/api"
import { downloadMergedSubsystemCsv, downloadConsolidatedFleetReport } from "@/lib/fault-disruptors/report"
import { CONDITION_META, SUBSYSTEM_PRESENTATION, SUBSYSTEMS, idleCars, type CarState, type Subsystem } from "@/lib/fault-disruptors/data"
import { buildLiveView } from "@/lib/fault-disruptors/live"
import { createDashboardWorkspace, fileJobId, loadDashboardWorkspace, saveDashboardWorkspace, type AnalysisJob, type DashboardWorkspace, type SubsystemWorkspace } from "@/lib/fault-disruptors/workspace"

const SUBSYSTEM_UPLOAD: Record<Subsystem, { accept: string; label: string }> = {
  ACV: { accept: ".xlsx", label: "Excel (.xlsx)" },
  DOOR: { accept: ".csv", label: "CSV (.csv)" },
  RAIL: { accept: ".csv", label: "CSV (.csv)" },
  SHM: { accept: ".csv", label: "CSV (.csv)" },
}

export default function Page() {
  const [dashboard, setDashboard] = useState<DashboardWorkspace>(createDashboardWorkspace)
  const [hydrated, setHydrated] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [csvMenuOpen, setCsvMenuOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDashboard(loadDashboardWorkspace())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try { saveDashboardWorkspace(dashboard) } catch { /* local storage can be unavailable or full */ }
  }, [dashboard, hydrated])

  const subsystem = dashboard.activeSubsystem
  const workspace = dashboard.workspaces[subsystem]
  const activeJob = workspace.jobs.find((job) => job.id === workspace.activeJobId) ?? workspace.jobs[0] ?? null
  const result = activeJob?.status === "complete" ? activeJob.result ?? null : null
  const live = useMemo(() => result ? buildLiveView(subsystem, result) : null, [result, subsystem])
  const cars: CarState[] = useMemo(() => live?.cars ?? idleCars(), [live])
  const hoveredCar = hoveredId ? cars.find((car) => car.id === hoveredId) ?? null : null
  const hoveredIndex = hoveredCar ? cars.findIndex((car) => car.id === hoveredCar.id) : -1
  const uploadConfig = SUBSYSTEM_UPLOAD[subsystem]
  const presentation = SUBSYSTEM_PRESENTATION[subsystem]
  const isAnalyzing = workspace.jobs.some((job) => job.status === "running")
  const completed = workspace.jobs.filter((job) => job.status === "complete" && job.result)
  const downloadable = completed.filter((job) => job.result?.submission_csv)
  const completedSubsystems = useMemo(
    () => SUBSYSTEMS.filter((item) => dashboard.workspaces[item.id].jobs.some((job) => job.status === "complete" && job.result)),
    [dashboard.workspaces],
  )

  function commitDashboard(updater: (current: DashboardWorkspace) => DashboardWorkspace) {
    setDashboard((current) => {
      const next = updater(current)
      try { saveDashboardWorkspace(next) } catch { /* persistence is best effort */ }
      return next
    })
  }

  function updateWorkspace(target: Subsystem, updater: (current: SubsystemWorkspace) => SubsystemWorkspace) {
    commitDashboard((current) => ({ ...current, workspaces: { ...current.workspaces, [target]: updater(current.workspaces[target]) } }))
  }

  function switchSubsystem(next: Subsystem) {
    setHoveredId(null)
    setFileError(null)
    setCsvMenuOpen(false)
    commitDashboard((current) => ({ ...current, activeSubsystem: next }))
  }

  function stageReports(files: File[]) {
    const targetSubsystem = subsystem
    const valid: AnalysisJob[] = []
    const invalid: string[] = []
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(uploadConfig.accept)) invalid.push(file.name)
      else valid.push({ id: fileJobId(file), fileName: file.name, size: file.size, lastModified: file.lastModified, status: "staged", file })
    }
    setFileError(invalid.length ? `${invalid.length} file${invalid.length === 1 ? "" : "s"} skipped. ${subsystem} requires ${uploadConfig.label}.` : null)
    if (!valid.length) return
    updateWorkspace(targetSubsystem, (current) => {
      const jobs = [...current.jobs]
      for (const job of valid) {
        const index = jobs.findIndex((item) => item.id === job.id)
        if (index >= 0) jobs[index] = job
        else jobs.push(job)
      }
      return { ...current, jobs, activeJobId: valid[0].id }
    })
    void analyseBatch(targetSubsystem, valid)
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    stageReports(Array.from(event.target.files ?? []))
    event.target.value = ""
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    stageReports(Array.from(event.dataTransfer.files ?? []))
  }

  async function analyseBatch(targetSubsystem: Subsystem, jobs: AnalysisJob[]) {
    let cursor = 0
    const worker = async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++]
        if (!job.file) continue
        updateWorkspace(targetSubsystem, (current) => ({ ...current, jobs: current.jobs.map((item) => item.id === job.id ? { ...item, status: "running", error: undefined } : item) }))
        try {
          const response = await analyse(targetSubsystem, job.file)
          updateWorkspace(targetSubsystem, (current) => ({ ...current, activeJobId: current.activeJobId ?? job.id, jobs: current.jobs.map((item) => item.id === job.id ? { ...item, status: "complete", result: response, error: undefined } : item) }))
        } catch (error) {
          updateWorkspace(targetSubsystem, (current) => ({ ...current, jobs: current.jobs.map((item) => item.id === job.id ? { ...item, status: "error", error: error instanceof Error ? error.message : "Analysis failed" } : item) }))
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(2, jobs.length) }, worker))
  }

  function removeJob(id: string) {
    updateWorkspace(subsystem, (current) => {
      const jobs = current.jobs.filter((job) => job.id !== id)
      return { ...current, jobs, activeJobId: current.activeJobId === id ? jobs[0]?.id ?? null : current.activeJobId }
    })
  }

  function clearWorkspace() {
    updateWorkspace(subsystem, () => ({ jobs: [], activeJobId: null, selectedCarId: null }))
    setHoveredId(null)
    setFileError(null)
  }

  const verdictCondition = live?.verdict.condition ?? "neutral"
  const verdictMeta = CONDITION_META[verdictCondition]

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <Header reportFileName={workspace.jobs.length ? `${workspace.jobs.length} file${workspace.jobs.length === 1 ? "" : "s"}` : null} isAnalyzing={isAnalyzing} analysisComplete={completed.length > 0} selectedTrain={dashboard.selectedTrain} onTrainChange={(selectedTrain) => commitDashboard((current) => ({ ...current, selectedTrain }))} />
      <input ref={fileInputRef} type="file" multiple className="sr-only" accept={uploadConfig.accept} onChange={handleFileChange} />

      <div className="mx-auto max-w-7xl px-4 py-5 md:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">01 Task · {SUBSYSTEMS.find((item) => item.id === subsystem)?.full}</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{presentation.title}</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">{presentation.question}</p>
            {live ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold"
                  style={{ backgroundColor: verdictMeta.soft, color: verdictMeta.color }}
                >
                  <ConditionIcon condition={verdictCondition} className="size-5" />
                  {live.verdict.text}
                </div>

                {subsystem === "SHM" && (
                  <ShmHeatmapLegend currentD={live.panel.kind === "shm" ? live.panel.damage : null} />
                )}
              </div>
            ) : isAnalyzing ? (
              <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
                <Loader2 className="size-4 animate-spin" />
                Analyzing queued files…
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                {workspace.jobs.length ? "Select a completed result, or choose the file again to retry a failed analysis." : presentation.idleHint}
              </p>
            )}
          </div>

          <div className="flex flex-col items-stretch gap-2">
            <nav aria-label="Subsystem switcher" className="inline-flex overflow-x-auto rounded-lg border border-border bg-white p-0.5">
              {SUBSYSTEMS.map((item) => <button key={item.id} type="button" onClick={() => switchSubsystem(item.id)} aria-pressed={item.id === subsystem} className={`rounded-md px-3 py-2 text-sm font-semibold transition ${item.id === subsystem ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{item.label}{dashboard.workspaces[item.id].jobs.some((job) => job.status === "complete") && <span className="ml-1 text-emerald-400">•</span>}</button>)}
            </nav>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {completedSubsystems.length > 0 && (
                <button
                  type="button"
                  onClick={() => downloadConsolidatedFleetReport(dashboard)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-slate-800 active:scale-95"
                  title="Download complete executive maintenance report & submission CSVs for all active subsystems"
                >
                  <Download className="size-4 text-emerald-400" />
                  <span>Download All ({completedSubsystems.length})</span>
                </button>
              )}
              {downloadable.length > 1 && (
                <button
                  type="button"
                  onClick={() => downloadResultsZip(subsystem, workspace.jobs.filter((job) => job.status === "complete" || job.status === "error").map((job) => ({ sourceFile: job.fileName, submissionCsv: job.result?.submission_csv ?? null, prediction: job.result?.prediction, error: job.error })))}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <FileArchive className="size-4" />
                  ZIP ({downloadable.length})
                </button>
              )}
              {downloadable.length > 1 ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCsvMenuOpen((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    aria-haspopup="true"
                    aria-expanded={csvMenuOpen}
                  >
                    <Download className="size-4" />
                    <span>CSV</span>
                    <ChevronDown className="size-3 text-slate-400" />
                  </button>

                  {csvMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setCsvMenuOpen(false)} />
                      <div className="absolute right-0 top-full z-40 mt-1 w-64 rounded-xl border border-border bg-white p-1.5 shadow-xl ring-1 ring-black/5">
                        <button
                          type="button"
                          onClick={() => {
                            setCsvMenuOpen(false)
                            if (result?.submission_csv) downloadCsv(subsystem, result.submission_csv)
                          }}
                          className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left transition hover:bg-slate-50"
                        >
                          <FileText className="mt-0.5 size-4 shrink-0 text-slate-500" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-800">Current file only</p>
                            <p className="truncate text-[11px] text-slate-400">{activeJob?.fileName}</p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setCsvMenuOpen(false)
                            downloadMergedSubsystemCsv(subsystem, workspace.jobs)
                          }}
                          className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left transition hover:bg-slate-50"
                        >
                          <Download className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-800">All {downloadable.length} files (Merged)</p>
                            <p className="truncate text-[11px] text-slate-400">{DOWNLOAD_NAME[subsystem]}</p>
                          </div>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : result?.submission_csv ? (
                <button
                  type="button"
                  onClick={() => downloadCsv(subsystem, result.submission_csv!)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Download className="size-4" />
                  CSV
                </button>
              ) : null}
              {workspace.jobs.length > 0 && <button type="button" onClick={clearWorkspace} className="rounded-lg border border-border bg-white p-2.5 text-slate-500 hover:text-red-600" aria-label="Clear this subsystem"><RotateCcw className="size-4" /></button>}
            </div>
          </div>
        </div>

        {live && <div className="mt-5"><KpiStrip items={live.kpis} /></div>}

        <section className="relative mt-5 rounded-xl border border-border bg-white p-3 md:p-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2 px-1"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">02 Digital Twin</p><h3 className="mt-0.5 text-sm font-bold text-slate-900">{dashboard.selectedTrain} · {presentation.twinLabel}</h3></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{subsystem === "RAIL" ? "Measured Track Window" : "8-Car Consist"}</span></div>
          <div className="relative overflow-x-auto pb-2"><div className="relative min-w-[720px] md:min-w-0"><TrainTwin subsystem={subsystem} cars={cars} railSide={live?.railSide ?? null} railDistanceM={live?.panel.kind === "rail" ? live.panel.distanceM : null} railHotspot={live?.panel.kind === "rail" ? live.panel.hotspot : null} selectedId={workspace.selectedCarId} hoveredId={hoveredId} onHover={setHoveredId} onSelect={(selectedCarId) => updateWorkspace(subsystem, (current) => ({ ...current, selectedCarId }))} />{hoveredCar && (hoveredCar.condition !== "neutral" || hoveredCar.overlay) && hoveredIndex >= 0 && <HoverBubble car={hoveredCar} leftFraction={carCenterFraction(hoveredIndex, cars.length)} />}</div></div>
          <p className="mt-1 text-center text-xs font-medium text-slate-500">{live ? presentation.twinHint : presentation.twinIdleHint}</p>
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-white p-4 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">03 {live ? "Evidence & Analysis" : "Input Data"}</p><h3 className="mt-0.5 text-sm font-bold text-slate-900">{live ? presentation.evidenceLabel : presentation.uploadTitle}</h3></div>{workspace.jobs.length > 0 && <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><UploadCloud className="size-4" />Choose files</button>}</div>
          <div onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
            <BatchQueue jobs={workspace.jobs} activeId={activeJob?.id ?? null} onSelect={(activeJobId) => updateWorkspace(subsystem, (current) => ({ ...current, activeJobId }))} onRemove={removeJob} />
            {fileError && <p role="alert" className="mt-3 text-xs font-semibold text-red-600">{fileError}</p>}
            {!live && workspace.jobs.length === 0 && <EmptyUpload title={presentation.uploadTitle} hint={presentation.uploadHint} format={uploadConfig.label} onClick={() => fileInputRef.current?.click()} />}
          </div>
          {live && <div className="mt-6 border-t border-border pt-6">
            {live.panel.kind === "acv" && <PanelAcv rows={live.panel.rows} margin={live.panel.margin} emptyCars={live.panel.emptyCars} />}
            {live.panel.kind === "door" && <PanelDoor cycles={live.panel.cycles} showcaseLocation={live.panel.showcaseLocation} />}
            {live.panel.kind === "rail" && <PanelRail label={live.panel.label} side={live.panel.side} speedKmh={live.panel.speedKmh} speedChanges={live.panel.speedChanges} distanceM={live.panel.distanceM} hotspot={live.panel.hotspot} filename={live.panel.filename} lowMotion={live.panel.lowMotion} />}
            {live.panel.kind === "shm" && <PanelShm damage={live.panel.damage} condition={live.panel.condition} signal={live.panel.signal} sampleCount={live.panel.sampleCount} />}
            <TechnicalDetails details={live.technical} />
          </div>}
        </section>
      </div>
    </main>
  )
}

function EmptyUpload({ title, hint, format, onClick }: { title: string; hint: string; format: string; onClick: () => void }) {
  return <div className="mt-4 flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center"><FileText className="size-7 text-slate-400" /><p className="mt-3 text-sm font-bold text-slate-800">{title}</p><p className="mt-1 max-w-xl text-xs text-slate-500">{hint} Select one or more {format} files.</p><button type="button" onClick={onClick} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"><UploadCloud className="size-4" />Choose files</button></div>
}

function ShmHeatmapLegend({ currentD }: { currentD: number | null }) {
  const boundedPct = currentD !== null && Number.isFinite(currentD) ? Math.min(100, Math.max(0, currentD * 100)) : null

  return (
    <div className="inline-flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 shadow-2xs backdrop-blur-xs">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <span>Damage Scale (D)</span>
          {currentD !== null && Number.isFinite(currentD) && (
            <span className="font-mono text-[11px] font-bold text-slate-800">
              D = {currentD.toFixed(4)}
            </span>
          )}
        </div>

        <div className="relative mt-0.5 h-2.5 w-36 overflow-visible rounded-full bg-slate-200">
          <div className="h-full w-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 via-65% to-red-500" />
          
          {/* Threshold markers at 0.5 (50%) and 0.8 (80%) */}
          <div className="absolute top-0 h-full w-px bg-white/90" style={{ left: "50%" }} title="D = 0.5 Review threshold" />
          <div className="absolute top-0 h-full w-px bg-white/90" style={{ left: "80%" }} title="D = 0.8 Critical threshold" />

          {/* Current position needle */}
          {boundedPct !== null && (
            <div
              className="absolute -top-1 -ml-1 size-4 rounded-full border-2 border-white bg-slate-900 shadow-xs transition-all duration-500"
              style={{ left: `${boundedPct}%` }}
              title={`Current damage: ${currentD?.toFixed(4)}`}
            />
          )}
        </div>

        <div className="flex w-36 justify-between text-[9px] font-semibold text-slate-400">
          <span>0</span>
          <span>0.5</span>
          <span>0.8</span>
          <span>1.0</span>
        </div>
      </div>

      <div className="flex items-center gap-2 border-l border-slate-200 pl-2.5 text-[11px] font-semibold">
        <span className="inline-flex items-center gap-1 text-emerald-700" title="D < 0.5">
          <span className="size-2 rounded-full bg-emerald-500" /> &lt;0.5 Normal
        </span>
        <span className="inline-flex items-center gap-1 text-amber-700" title="0.5 <= D < 0.8">
          <span className="size-2 rounded-full bg-amber-500" /> 0.5–0.8 Review
        </span>
        <span className="inline-flex items-center gap-1 text-red-700" title="D >= 0.8">
          <span className="size-2 rounded-full bg-red-500" /> &ge;0.8 Critical
        </span>
      </div>
    </div>
  )
}
