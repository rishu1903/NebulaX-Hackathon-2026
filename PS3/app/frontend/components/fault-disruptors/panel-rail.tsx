"use client"

import { useState, useEffect } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { AlertTriangle, CheckCircle2, Download, FileText, Wrench } from "lucide-react"
import {
  RAIL_ISO_THRESHOLD,
  RAIL_SPECTRUM,
  RAIL_SPEED,
  RAIL_VIBRATION,
} from "@/lib/fault-disruptors/data"
import { PanelTitle } from "./panel-acv"

const axis = { fontSize: 10, fill: "#94a3b8" }

function ChartCard({ title, sub, children, ready }: { title: string; sub: string; children: React.ReactNode; ready: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
      <p className="text-xs font-bold text-slate-800">{title}</p>
      <p className="mb-2 text-[11px] text-slate-400">{sub}</p>
      <div className="h-40">
        {ready ? (
          children
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-lg bg-slate-50 font-mono text-xs text-slate-400">
            Streaming sensor telemetry...
          </div>
        )}
      </div>
    </div>
  )
}

export function PanelRail() {
  const [dispatched, setDispatched] = useState(false)
  const [chartsMounted, setChartsMounted] = useState(false)

  useEffect(() => {
    // Tiny delay to unblock main thread so train animation starts on frame 0 with 0ms lag
    const timer = setTimeout(() => setChartsMounted(true), 60)
    return () => clearTimeout(timer)
  }, [])

  const handleExportJson = () => {
    const data = {
      file_id: "Test24.csv",
      subsystem: "Rail Corrugation",
      timestamp: new Date().toISOString(),
      distance_traversed_m: 18.07,
      mean_speed_kmh: 64.8,
      prediction: "Side I Corrugation Detected",
      defect_chainage_span: "6.0 m to 13.8 m",
      metrics: {
        peak_rms: 8.42,
        iso_advisory_limit: RAIL_ISO_THRESHOLD,
        dominant_peak_hz: 342.5,
        crest_factor: 2.85,
      },
      work_order: {
        id: "WO-2026-RGT-04",
        action: "Deploy Rail Grinding Train (RGT)",
        grinding_depth_mm: 0.15,
        assigned_depot: "Bishan P-Way Depot",
        urgency: "Within 48 Hours",
      },
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "rail_telemetry_Test24.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <PanelTitle
        title="Rail Corrugation — Engineering Evidence & Action"
        hint="Measured 10 kHz sensor data & Permanent-Way rectification plan"
      />

      {/* 3 Telemetry Sensor Charts */}
      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard title="Vibration Envelope & Rolling RMS" sub="Ch1 / Ch2 acceleration (m/s²) · ISO 10816 limit" ready={chartsMounted}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={RAIL_VIBRATION} margin={{ top: 5, right: 6, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="ch1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="t" tick={axis} tickLine={false} axisLine={false} unit="ms" />
              <YAxis tick={axis} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <ReferenceLine y={RAIL_ISO_THRESHOLD} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "ISO Limit", fill: "#f59e0b", fontSize: 10 }} />
              <Area type="monotone" dataKey="ch1" stroke="#ef4444" strokeWidth={1.5} fill="url(#ch1)" />
              <Line type="monotone" dataKey="rms" stroke="#0f172a" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Instantaneous Speed Tachograph" sub="Ch0 speed (km/h) over 1000 ms window" ready={chartsMounted}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={RAIL_SPEED} margin={{ top: 5, right: 6, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="t" tick={axis} tickLine={false} axisLine={false} unit="ms" />
              <YAxis domain={[55, 72]} tick={axis} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="speed" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Vibration Frequency Spectrum" sub="Real FFT power · ~340 Hz corrugation peak" ready={chartsMounted}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={RAIL_SPECTRUM} margin={{ top: 5, right: 6, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="hz" tick={axis} tickLine={false} axisLine={false} interval={9} unit="Hz" />
              <YAxis tick={axis} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="power">
                {RAIL_SPECTRUM.map((d, i) => (
                  <Cell key={i} fill={d.hz > 300 && d.hz < 380 ? "#ef4444" : "#cbd5e1"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Actionable Permanent-Way Work Order & Dispatch Box */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
              <Wrench className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900">P-Way Work Order #WO-2026-RGT-04</span>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                  Priority: Within 48 Hours
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-600">
                Action: <strong className="text-slate-900">Deploy Rail Grinding Train (RGT)</strong> · Target:{" "}
                <strong className="text-slate-900">Left Rail (Side I)</strong> at 6.0 m – 13.8 m stretch · Pass:{" "}
                <strong className="text-slate-900">0.15 mm depth</strong> · Assigned:{" "}
                <strong className="text-slate-900">Bishan P-Way Depot</strong>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Download className="size-3.5" />
              Export Telemetry JSON
            </button>

            <button
              type="button"
              onClick={() => setDispatched(true)}
              disabled={dispatched}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:bg-emerald-600"
            >
              {dispatched ? (
                <>
                  <CheckCircle2 className="size-3.5" />
                  Dispatched to Depot
                </>
              ) : (
                <>
                  <Wrench className="size-3.5" />
                  Dispatch Grinding Work Order
                </>
              )}
            </button>
          </div>
        </div>

        {dispatched && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 animate-in fade-in">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            <span>
              Work Order #WO-2026-RGT-04 successfully queued for tonight&apos;s maintenance window (01:30 – 04:30 AM). Bishan P-Way grinding crew notified.
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
