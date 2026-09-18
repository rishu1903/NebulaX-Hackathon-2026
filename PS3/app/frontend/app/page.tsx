"use client"

import { type DragEvent, type ChangeEvent, useMemo, useRef, useState } from "react"
import { CheckCircle2, FileText, Loader2, RotateCcw, UploadCloud, Wrench } from "lucide-react"
import { ConditionIcon } from "@/components/fault-disruptors/condition-icon"
import { Header } from "@/components/fault-disruptors/header"
import { HoverBubble } from "@/components/fault-disruptors/hover-bubble"
import { KpiStrip, type Kpi } from "@/components/fault-disruptors/kpi-strip"
import { PanelAcv } from "@/components/fault-disruptors/panel-acv"
import { PanelDoor } from "@/components/fault-disruptors/panel-door"
import { PanelRail } from "@/components/fault-disruptors/panel-rail"
import { PanelShm } from "@/components/fault-disruptors/panel-shm"
import { carCenterFraction, TrainTwin, trainStageWidth } from "@/components/fault-disruptors/train-twin"
import {
  CONDITION_META,
  RAIL_KPIS,
  SUBSYSTEM_DATA,
  SUBSYSTEMS,
  type CarState,
  type Subsystem,
} from "@/lib/fault-disruptors/data"

const SUBSYSTEM_KPIS: Record<Subsystem, Kpi[]> = {
  ACV: [
    { label: "Consist", value: "8 Cars", condition: "neutral" },
    { label: "Flagged", value: "Car 03", condition: "issue" },
    { label: "Under Review", value: "Car 06", condition: "review" },
    { label: "Verdict", value: "Refrigerant Leak", condition: "issue" },
  ],
  DOOR: [
    { label: "Cycles Evaluated", value: "38", condition: "neutral" },
    { label: "Abnormal", value: "3 Cycles", condition: "issue" },
    { label: "Review", value: "2 Cycles", condition: "review" },
    { label: "Verdict", value: "Car 04 Resistance", condition: "issue" },
  ],
  RAIL: RAIL_KPIS,
  SHM: [
    { label: "Carriage", value: "Car 05", condition: "neutral" },
    { label: "Fatigue Zone", value: "Center Body", condition: "issue" },
    { label: "Review Zone", value: "Underframe", condition: "review" },
    { label: "Verdict", value: "Fatigue Signature", condition: "issue" },
  ],
}

const ANALYSIS_STEPS = ["Parsing report", "Extracting subsystem signals", "Updating digital twin"]
const TRAIN_OPTIONS = ["011", "012", "601", "701"] as const
type TrainId = (typeof TRAIN_OPTIONS)[number]

const SUBSYSTEM_UPLOAD: Record<Subsystem, { accept: string; label: string }> = {
  ACV: { accept: ".xlsx", label: "Excel (.xlsx)" },
  DOOR: { accept: ".csv", label: "CSV (.csv)" },
  RAIL: { accept: ".csv", label: "CSV (.csv)" },
  SHM: { accept: ".csv", label: "CSV (.csv)" },
}

export default function Page() {
  const [subsystem, setSubsystem] = useState<Subsystem>("ACV")
  const [selectedTrain, setSelectedTrain] = useState<TrainId>("011")
  const [analyzed, setAnalyzed] = useState(false)
  const [reportFile, setReportFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisStep, setAnalysisStep] = useState(0)
  const [carCount, setCarCount] = useState<3 | 6 | 8>(8)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [rectifiedIds, setRectifiedIds] = useState<Set<number>>(() => new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const view = SUBSYSTEM_DATA[subsystem]
  const reportFileName = reportFile?.name ?? null
  const uploadConfig = SUBSYSTEM_UPLOAD[subsystem]

  const cars: CarState[] = useMemo(() => {
    const consist = view.cars.slice(0, carCount)
    if (!analyzed) {
      return consist.map((c) => ({ ...c, condition: "neutral", rank: undefined, finding: "Awaiting analysis" }))
    }
    return consist.map((c) =>
      rectifiedIds.has(c.id)
        ? {
            ...c,
            condition: "normal",
            rank: undefined,
            affectedDoors: undefined,
            finding: "Rectified maintenance action logged. Monitor on next inspection cycle.",
          }
        : c,
    )
  }, [analyzed, view, carCount, rectifiedIds])

  const railSide = analyzed && subsystem === "RAIL" ? ("I" as const) : null
  const hoveredCar = hoveredId ? cars.find((c) => c.id === hoveredId) ?? null : null
  const hoveredIndex = hoveredCar ? cars.findIndex((c) => c.id === hoveredCar.id) : -1
  const unresolvedCars = cars.filter((car) => car.condition === "issue" || car.condition === "review")
  const selectedCar = selectedId ? cars.find((car) => car.id === selectedId) ?? null : null
  const actionCar = selectedCar && selectedCar.condition !== "normal" ? selectedCar : unresolvedCars[0] ?? null
  const allRectified = analyzed && unresolvedCars.length === 0

  function switchSubsystem(s: Subsystem) {
    if (s === subsystem) return
    clearAnalysisTimers()
    setSubsystem(s)
    setReportFile(null)
    setFileError(null)
    setAnalyzed(false)
    setIsAnalyzing(false)
    setAnalysisStep(0)
    setSelectedId(null)
    setHoveredId(null)
    setRectifiedIds(new Set())
  }

  function switchTrain(train: string) {
    setSelectedTrain(train as TrainId)
    clearAnalysisTimers()
    setReportFile(null)
    setFileError(null)
    setAnalyzed(false)
    setIsAnalyzing(false)
    setAnalysisStep(0)
    setSelectedId(null)
    setHoveredId(null)
    setRectifiedIds(new Set())
  }

  function clearAnalysisTimers() {
    timersRef.current.forEach((timer) => clearTimeout(timer))
    timersRef.current = []
  }

  function stageReport(file: File | null | undefined) {
    if (!file) return
    clearAnalysisTimers()

    const requiredExtension = uploadConfig.accept.toLowerCase()
    if (!file.name.toLowerCase().endsWith(requiredExtension)) {
      setReportFile(null)
      setFileError(`${subsystem} requires ${uploadConfig.label} input.`)
      setAnalyzed(false)
      setIsAnalyzing(false)
      setAnalysisStep(0)
      return
    }

    setReportFile(file)
    setFileError(null)
    setAnalyzed(false)
    setIsAnalyzing(false)
    setAnalysisStep(0)
    setSelectedId(null)
    setHoveredId(null)
    setRectifiedIds(new Set())
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    stageReport(event.target.files?.[0])
    event.target.value = ""
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    stageReport(event.dataTransfer.files?.[0])
  }

  function runAnalysis() {
    if (analyzed) {
      clearAnalysisTimers()
      setAnalyzed(false)
      setIsAnalyzing(false)
      setAnalysisStep(0)
      setSelectedId(null)
      setHoveredId(null)
      setRectifiedIds(new Set())
      return
    }

    if (!reportFileName) {
      fileInputRef.current?.click()
      return
    }

    clearAnalysisTimers()
    setAnalyzed(false)
    setIsAnalyzing(true)
    setAnalysisStep(0)
    setSelectedId(null)
    setHoveredId(null)
    setRectifiedIds(new Set())

    timersRef.current = [
      setTimeout(() => setAnalysisStep(1), 650),
      setTimeout(() => setAnalysisStep(2), 1300),
      setTimeout(() => {
        setIsAnalyzing(false)
        setAnalyzed(true)
        setAnalysisStep(ANALYSIS_STEPS.length - 1)
      }, 1950),
    ]
  }

  function resetTwin() {
    clearAnalysisTimers()
    setAnalyzed(false)
    setIsAnalyzing(false)
    setAnalysisStep(0)
    setSelectedId(null)
    setHoveredId(null)
    setRectifiedIds(new Set())
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

  const verdictCondition = allRectified ? "normal" : view.verdict.condition
  const verdictMeta = CONDITION_META[verdictCondition]
  const verdictText = allRectified ? "All highlighted findings rectified. Continue monitoring." : view.verdict.text
  const analysisButtonLabel = isAnalyzing
      ? "Analyzing..."
      : reportFileName
        ? "Analyze Report"
        : "Upload report first"

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <Header
        onUploadClick={() => fileInputRef.current?.click()}
        selectedTrain={selectedTrain}
        onTrainChange={switchTrain}
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
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{view.headline}</h2>
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
                {reportFileName} staged for Train {selectedTrain}.
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                Train {selectedTrain} selected. Upload telemetry or a report to run diagnostics.
              </p>
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
            <div
              className="flex items-center rounded-lg border border-border bg-white p-0.5"
              role="group"
              aria-label="Consist length"
            >
              {([3, 6, 8] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setCarCount(n)
                    setSelectedId(null)
                    setHoveredId(null)
                  }}
                  className={[
                    "rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                    carCount === n ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50",
                  ].join(" ")}
                  aria-pressed={carCount === n}
                >
                  {n}-Car
                </button>
              ))}
            </div>
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
            {analyzed && (
              <button
                type="button"
                onClick={resetTwin}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-white px-2.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Reset
              </button>
            )}
          </div>
        </div>

        {analyzed && (
          <FindingActionPanel car={actionCar} allRectified={allRectified} onRectify={markRectified} />
        )}

        {/* KPI strip */}
        {analyzed && (
          <div className="mt-5">
            <KpiStrip
              items={SUBSYSTEM_KPIS[subsystem].map((k) =>
                k.label === "Consist" ? { ...k, value: `${carCount} Cars` } : k,
              )}
            />
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
              ? "Hover a carriage for its finding. Click a highlighted carriage to prepare a rectification action."
              : reportFileName
                ? "Report staged. Analyze it to reveal subsystem health across the train."
                : "The train is the interface. Upload a report to begin diagnostics."}
          </p>
        </section>

        {/* Supporting panel */}
        <section className="mt-6 rounded-2xl border border-border bg-white p-4 md:p-6">
          {!analyzed ? (
            <ReportIntake
              fileName={reportFileName}
              fileError={fileError}
              acceptedFormat={uploadConfig.label}
              isAnalyzing={isAnalyzing}
              activeStep={analysisStep}
              onUploadClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
            />
          ) : subsystem === "ACV" ? (
            <PanelAcv />
          ) : subsystem === "DOOR" ? (
            <PanelDoor />
          ) : subsystem === "RAIL" ? (
            <PanelRail />
          ) : (
            <PanelShm />
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
          {car.affectedDoors && (
            <p className="mt-1 text-sm font-medium text-slate-600">
              Affected door elements: {car.affectedDoors.map((door) => `D${door}`).join(", ")}
            </p>
          )}
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
  fileError,
  acceptedFormat,
  isAnalyzing,
  activeStep,
  onUploadClick,
  onDrop,
}: {
  fileName: string | null
  fileError: string | null
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
        <p className="mt-1 text-xs text-slate-500">
          {fileName ?? `Required input: ${acceptedFormat}`}
        </p>
        {fileError && <p className="mt-2 text-xs font-semibold text-red-600">{fileError}</p>}
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
