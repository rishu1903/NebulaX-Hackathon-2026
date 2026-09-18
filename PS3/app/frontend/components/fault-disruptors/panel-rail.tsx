"use client"

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
import {
  RAIL_ISO_THRESHOLD,
  RAIL_SPECTRUM,
  RAIL_SPEED,
  RAIL_VIBRATION,
} from "@/lib/fault-disruptors/data"
import { PanelTitle } from "./panel-acv"

const axis = { fontSize: 10, fill: "#94a3b8" }

function ChartCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-white p-3">
      <p className="text-xs font-bold text-slate-800">{title}</p>
      <p className="mb-2 text-[11px] text-slate-400">{sub}</p>
      <div className="h-40">{children}</div>
    </div>
  )
}

export function PanelRail() {
  return (
    <div>
      <PanelTitle title="Rail Corrugation — Engineering Evidence" hint="Measured sensor data from the 1.0 s recording window" />
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <ChartCard title="Vibration Envelope & Rolling RMS" sub="Ch1 / Ch2 acceleration (m/s²) · ISO advisory">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={RAIL_VIBRATION} margin={{ top: 5, right: 6, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="ch1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="t" tick={axis} tickLine={false} axisLine={false} unit="" />
              <YAxis tick={axis} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <ReferenceLine y={RAIL_ISO_THRESHOLD} stroke="#f59e0b" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="ch1" stroke="#ef4444" strokeWidth={1.5} fill="url(#ch1)" />
              <Line type="monotone" dataKey="rms" stroke="#0f172a" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Instantaneous Speed Tachograph" sub="Ch0 speed (km/h) over 1000 ms">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={RAIL_SPEED} margin={{ top: 5, right: 6, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="t" tick={axis} tickLine={false} axisLine={false} />
              <YAxis domain={[55, 72]} tick={axis} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="speed" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Vibration Frequency Spectrum" sub="Real FFT power · ~340 Hz corrugation peak">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={RAIL_SPECTRUM} margin={{ top: 5, right: 6, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="hz" tick={axis} tickLine={false} axisLine={false} interval={9} />
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
    </div>
  )
}
