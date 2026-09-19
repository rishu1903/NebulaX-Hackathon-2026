"use client"

import { type DragEvent, type ChangeEvent, useMemo, useRef, useState } from "react"
import { CheckCircle2, Download, FileText, Loader2, RotateCcw, UploadCloud, Wrench } from "lucide-react"
import { ConditionIcon } from "@/components/fault-disruptors/condition-icon"
import { Header } from "@/components/fault-disruptors/header"
import { HoverBubble } from "@/components/fault-disruptors/hover-bubble"
import { KpiStrip } from "@/components/fault-disruptors/kpi-strip"
import { PanelAcv } from "@/components/fault-disruptors/panel-acv"
import { PanelDoor } from "@/components/fault-disruptors/panel-door"
import { PanelRail } from "@/components/fault-disruptors/panel-rail"
import { PanelShm } from "@/components/fault-disruptors/panel-shm"
import { TechnicalDetails } from "@/components/fault-disruptors/technical-details"
import { carCenterFraction, TrainTwin, trainStageWidth } from "@/components/fault-disruptors/train-twin"
import { analyse, downloadCsv, type AnalyseResult } from "@/lib/fault-disruptors/api"
import {
  CONDITION_META,
  SUBSYSTEM_HEADLINES,
  SUBSYSTEMS,
  idleCars,
  type CarState,
  type Subsystem,
} from "@/lib/fault-disruptors/data"
import { buildLiveView } from "@/lib/fault-disruptors/live"

const ANALYSIS_STEPS = ["Uploading report", "Running the subsystem model", "Building the digital twin"]

const SUBSYSTEM_UPLOAD: Record<Subsystem, { accept: string; label: string }> = {
  ACV: { accept: ".xlsx", label: "Excel (.xlsx)" },
  DOOR: { accept: ".csv", label: "CSV (.csv)" },
  RAIL: { accept: ".csv", label: "CSV (.csv)" },
  SHM: { accept: ".csv", label: "CSV (.csv)" },
}

export default function Page() {
  const [subsystem, setSubsystem] = useState<Subsystem>("ACV")
  const [result, setResult] = useState<AnalyseResult | null>(null)
  const [reportFile, setReportFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisStep, setAnalysisStep] = useState(0)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [rectifiedIds, setRectifiedIds] = useState<Set<number>>(() => new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  /** Incremented whenever an in-flight analysis should be ignored (reset, new file, subsystem switch). */
  const requestRef = useRef(0)

  const analyzed = result !== null
  const live = useMemo(() => (result ? buildLiveView(subsystem, result) : null), [result, subsystem])
  const reportFileName = reportFile?.name ?? null
  const uploadConfig = SUBSYSTEM_UPLOAD[subsystem]

  const cars: CarState[] = useMemo(() => {
    if (!live) return idleCars()
    return live.cars.map((c) =>
      rectifiedIds.has(c.id)
        ? {
            ...c,
            condition: "normal",
            rank: undefined,
            finding: "Rectified maintenance action logged. Monitor on next inspection cycle.",
          }
        : c,
    )
  }, [live, rectifiedIds])

  const railSide = live?.railSide ?? null
  const hoveredCar = hoveredId ? cars.find((c) => c.id === hoveredId) ?? null : null
  const hoveredIndex = hoveredCar ? cars.findIndex((c) => c.id === hoveredCar.id) : -1
  const unresolvedCars = cars.filter((car) => car.condition === "issue" || car.condition === "review")
  const selectedCar = selectedId ? cars.find((car) => car.id === selectedId) ?? null : null
  const actionCar = selectedCar && selectedCar.condition !== "normal" ? selectedCar : unresolvedCars[0] ?? null
  const hadFlaggedCars = live ? live.cars.some((c) => c.condition === "issue" || c.condition === "review") : false
  const allRectified = analyzed && hadFlaggedCars && unresolvedCars.length === 0

  function clearAnalysisTimers() {
    timersRef.current.forEach((timer) => clearTimeout(timer))
    timersRef.current = []
  }

  /** Back to the idle, pre-analysis state. Optionally keeps the staged file. */
  function resetAnalysis({ keepFile }: { keepFile: boolean }) {
    requestRef.current += 1
    clearAnalysisTimers()
    setResult(null)
    setIsAnalyzing(false)
    setAnalysisStep(0)
    setAnalysisError(null)
    setSelectedId(null)
    setHoveredId(null)
    setRectifiedIds(new Set())
    if (!keepFile) {
      setReportFile(null)
      setFileError(null)
    }
  }

  function switchSubsystem(s: Subsystem) {
    if (s === subsystem) return
    resetAnalysis({ keepFile: false })
    setSubsystem(s)
  }

  function stageReport(file: File | null | undefined) {
    if (!file) return
    resetAnalysis({ keepFile: false })

    const requiredExtension = uploadConfig.accept.toLowerCase()
    if (!file.name.toLowerCase().endsWith(requiredExtension)) {
      setFileError(`${subsystem} requires ${uploadConfig.label} input.`)
      return
    }
    setReportFile(file)
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    stageReport(event.target.files?.[0])
    event.target.value = ""
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    stageReport(event.dataTransfer.files?.[0])
  }

  async function runAnalysis() {
    if (analyzed) {
      resetAnalysis({ keepFile: true })
      return
    }
    if (!reportFile) {
      fileInputRef.current?.click()
      return
    }

    resetAnalysis({ keepFile: true })
    const requestId = requestRef.current
    setIsAnalyzing(true)
    timersRef.current = [setTimeout(() => setAnalysisStep(1), 500)]

    try {
      const response = await analyse(subsystem, reportFile)
      if (requestRef.current !== requestId) return
      setAnalysisStep(2)
      setResult(response)
    } catch (error) {
      if (requestRef.current !== requestId) return
      setAnalysisError(error instanceof Error ? error.message : "Analysis failed. Please try again.")
    } finally {
      if (requestRef.current === requestId) {
        clearAnalysisTimers()
        setIsAnalyzing(false)
      }
    }
  }

  function markRectified(id: number) {
    setRectifiedIds((current) => {
      const next = new Set(current)
      next.add(id)
      return next
    })
    setSelectedId(null)
    setHoveredId(null)
  }

  const headline = live?.headline ?? SUBSYSTEM_HEADLINES[subsystem]
  const verdictCondition = allRectified ? "normal" : (live?.verdict.condition ?? "neutral")
  const verdictMeta = CONDITION_META[verdictCondition]
  const verdictText = allRectified ? "All highlighted findings rectified. Continue monitoring." : (live?.verdict.text ?? "")
  const analysisButtonLabel = isAnalyzing ? "Analyzing..." : reportFileName ? "Analyze Report" : "Upload report first"

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <Header
        onUploadClick={() => fileInputRef.current?.click()}
        reportFileName={reportFileName}
        isAnalyzing={isAnalyzing}
        analysisComplete={analyzed}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        accept={uploadConfig.accept}
        onChange={handleFileChange}
      />

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        {/* Verdict + controls */}
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              {SUBSYSTEMS.find((s) => s.id === subsystem)?.full}
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{headline}</h2>
            {analyzed ? (
              <div
                className="mt-3 inline-flex max-w-full items-center gap-2 rounded-lg px-3 py-2 text-base font-bold"
                style={{ backgroundColor: verdictMeta.soft, color: verdictMeta.color }}
              >
                <ConditionIcon condition={verdictCondition} className="size-5 shrink-0" />
                <span>{verdictText}</span>
              </div>
            ) : isAnalyzing ? (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {ANALYSIS_STEPS[analysisStep]}
              </div>
            ) : reportFileName ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
                <FileText className="size-4 text-slate-400" aria-hidden="true" />
                {reportFileName} staged for analysis.
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Upload telemetry or a report to run diagnostics.</p>
            )}
          </div>

          <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
            <nav
              aria-label="Subsystem switcher"
              className="inline-flex overflow-x-auto rounded-lg border border-border bg-white p-0.5"
            >
              {SUBSYSTEMS.map((s) => {
                const selected = s.id === subsystem
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => switchSubsystem(s.id)}
                    aria-pressed={selected}
                    title={s.full}
                    className={[
                      "relative rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                      selected ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                    ].join(" ")}
                  >
                    {s.label}
                  </button>
                )
              })}
            </nav>
            {!analyzed && (
              <button
                type="button"
                onClick={runAnalysis}
                disabled={isAnalyzing}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isAnalyzing && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {analysisButtonLabel}
              </button>
            )}
            {analyzed && result?.submission_csv && (
              <button
                type="button"
                onClick={() => downloadCsv(subsystem, result.submission_csv as string)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
              >
                <Download className="size-4" aria-hidden="true" />
                Download CSV
              </button>
            )}
            {analyzed && (
              <button
                type="button"
                onClick={() => resetAnalysis({ keepFile: true })}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-white px-2.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Reset
              </button>
            )}
          </div>
        </div>

        {analyzed && <FindingActionPanel car={actionCar} allRectified={allRectified} onRectify={markRectified} />}

        {/* KPI strip */}
        {live && (
          <div className="mt-5">
            <KpiStrip items={live.kpis} />
          </div>
        )}

        {/* Train hero */}
        <section className="relative mt-6 rounded-xl border border-border bg-white p-3 md:p-5">
          <div className="relative overflow-x-auto pb-2">
            <div className="relative" style={{ minWidth: trainStageWidth(cars.length) }}>
              <TrainTwin
                subsystem={subsystem}
                cars={cars}
                railSide={railSide}
                selectedId={selectedId}
                hoveredId={hoveredId}
                onHover={setHoveredId}
                onSelect={setSelectedId}
              />
              {hoveredCar && hoveredCar.condition !== "neutral" && hoveredIndex >= 0 && (
                <HoverBubble car={hoveredCar} leftFraction={carCenterFraction(hoveredIndex, cars.length)} />
              )}
            </div>
          </div>
          <p className="mt-2 text-center text-sm font-medium text-slate-500">
            {analyzed
              ? subsystem === "ACV"
                ? "Hover a carriage for its finding. Click a highlighted carriage to prepare a rectification action."
                : "This subsystem reports for the whole recording rather than per carriage — see the results below."
              : reportFileName
                ? "Report staged. Analyze it to reveal subsystem health."
                : "The train is the interface. Upload a report to begin diagnostics."}
          </p>
        </section>

        {/* Supporting panel */}
        <section className="mt-6 rounded-2xl border border-border bg-white p-4 md:p-6">
          {!live ? (
            <ReportIntake
              fileName={reportFileName}
              errorMessage={fileError ?? analysisError}
              acceptedFormat={uploadConfig.label}
              isAnalyzing={isAnalyzing}
              activeStep={analysisStep}
              onUploadClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
            />
          ) : (
            <>
              {live.panel.kind === "acv" && (
                <PanelAcv rows={live.panel.rows} margin={live.panel.margin} emptyCars={live.panel.emptyCars} />
              )}
              {live.panel.kind === "door" && <PanelDoor cycles={live.panel.cycles} />}
              {live.panel.kind === "rail" && (
                <PanelRail
                  label={live.panel.label}
                  side={live.panel.side}
                  speedKmh={live.panel.speedKmh}
                  speedChanges={live.panel.speedChanges}
                  lowMotion={live.panel.lowMotion}
                />
              )}
              {live.panel.kind === "shm" && <PanelShm damage={live.panel.damage} condition={live.panel.condition} />}
              <TechnicalDetails details={live.technical} />
            </>
          )}
        </section>
      </div>
    </main>
  )
}

function FindingActionPanel({
  car,
  allRectified,
  onRectify,
}: {
  car: CarState | null
  allRectified: boolean
  onRectify: (id: number) => void
}) {
  if (allRectified) {
    return (
      <section className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
          <CheckCircle2 className="size-5" aria-hidden="true" />
          Rectification log complete
        </div>
        <p className="mt-1 text-sm text-emerald-700">All currently detected carriage findings have been marked as rectified.</p>
      </section>
    )
  }

  if (!car) return null

  const meta = CONDITION_META[car.condition]
  return (
    <section className="mt-5 rounded-xl border bg-white p-4 shadow-sm" style={{ borderColor: meta.color }}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-bold"
              style={{ backgroundColor: meta.soft, color: meta.color }}
            >
              <ConditionIcon condition={car.condition} />
              {meta.label}
            </span>
            <span className="text-sm font-semibold text-slate-500">{car.label}</span>
            {car.rank && <span className="text-sm font-semibold text-slate-400">Priority #{car.rank}</span>}
          </div>
          <p className="mt-2 text-lg font-bold leading-tight text-slate-950">{car.finding}</p>
        </div>
        <button
          type="button"
          onClick={() => onRectify(car.id)}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/30"
        >
          <Wrench className="size-4" aria-hidden="true" />
          Mark Rectified
        </button>
      </div>
    </section>
  )
}

function ReportIntake({
  fileName,
  errorMessage,
  acceptedFormat,
  isAnalyzing,
  activeStep,
  onUploadClick,
  onDrop,
}: {
  fileName: string | null
  errorMessage: string | null
  acceptedFormat: string
  isAnalyzing: boolean
  activeStep: number
  onUploadClick: () => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center transition-colors hover:border-slate-400 hover:bg-slate-50"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <div className="flex size-12 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm ring-1 ring-border">
        {isAnalyzing ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : fileName ? (
          <FileText className="size-5" aria-hidden="true" />
        ) : (
          <UploadCloud className="size-5" aria-hidden="true" />
        )}
      </div>

      <div className="mt-3">
        <p className="text-sm font-bold text-slate-800">
          {isAnalyzing ? "Analyzing report" : fileName ? "Report ready for analysis" : "Drop inspection report here"}
        </p>
        <p className="mt-1 text-xs text-slate-500">{fileName ?? `Required input: ${acceptedFormat}`}</p>
        {errorMessage && (
          <p role="alert" className="mt-2 max-w-xl text-xs font-semibold text-red-600">
            {errorMessage}
          </p>
        )}
      </div>

      {isAnalyzing ? (
        <div className="mt-5 grid w-full max-w-xl gap-2 md:grid-cols-3">
          {ANALYSIS_STEPS.map((step, index) => {
            const complete = index < activeStep
            const active = index === activeStep
            return (
              <div
                key={step}
                className={[
                  "flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-left text-xs font-semibold",
                  active || complete ? "border-slate-300 text-slate-800" : "border-border text-slate-400",
                ].join(" ")}
              >
                {complete ? (
                  <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                ) : active ? (
                  <Loader2 className="size-4 animate-spin text-slate-700" aria-hidden="true" />
                ) : (
                  <span className="size-4 rounded-full border border-slate-300" aria-hidden="true" />
                )}
                {step}
              </div>
            )
          })}
        </div>
      ) : (
        <button
          type="button"
          onClick={onUploadClick}
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <UploadCloud className="size-4" aria-hidden="true" />
          {fileName ? "Replace Report" : "Upload Report"}
        </button>
      )}
    </div>
  )
}
