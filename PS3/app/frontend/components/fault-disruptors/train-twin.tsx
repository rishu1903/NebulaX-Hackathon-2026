"use client"

import { useState, type CSSProperties } from "react"
import { motion } from "framer-motion"
import { CONDITION_META, type CarState, type Subsystem } from "@/lib/fault-disruptors/data"

const MARGIN_X = 80
const CAR_W = 220
const GAP = 16

const ROOF_Y = 42
const ROOF_H = 24
const BODY_Y = 54
const BODY_H = 160
const BODY_BOTTOM = BODY_Y + BODY_H
const STRIPE_Y = 156
const STRIPE_H = 16
const SKIRT_Y = 190
const WHEEL_Y = 226
const VIEW_H = 320

function viewWidth(total: number) {
  return MARGIN_X * 2 + total * CAR_W + (total - 1) * GAP
}
function carX(index: number) {
  return MARGIN_X + index * (CAR_W + GAP)
}

type Props = {
  subsystem: Subsystem
  cars: CarState[]
  railSide: "I" | "II" | null
  selectedId: number | null
  hoveredId: number | null
  onHover: (id: number | null) => void
  onSelect: (id: number | null) => void
}

function generateCorrugationWave(startX: number, width: number, yCenter: number, amplitude: number, wavelength: number) {
  let d = `M ${startX} ${yCenter}`
  const cycles = Math.floor(width / wavelength)
  for (let i = 0; i < cycles; i++) {
    const x0 = startX + i * wavelength
    const x1 = x0 + wavelength * 0.25
    const x2 = x0 + wavelength * 0.75
    const x3 = x0 + wavelength
    d += ` C ${x1} ${yCenter - amplitude}, ${x2} ${yCenter + amplitude}, ${x3} ${yCenter}`
  }
  return d
}

export function TrainTwin({ subsystem, cars, railSide, selectedId, hoveredId, onHover, onSelect }: Props) {
  const total = cars.length
  const VIEW_W = viewWidth(total)
  const trackX = MARGIN_X - 40
  const trackW = total * CAR_W + (total - 1) * GAP + 80

  // Manual toggle for rail inspection focus mode (default true in RAIL tab)
  const [forceTrainVisible, setForceTrainVisible] = useState(false)
  const isRailMode = subsystem === "RAIL"
  const inspectRailBed = isRailMode && !forceTrainVisible

  const [scrubberX, setScrubberX] = useState<number | null>(null)

  const railTopActive = railSide === "I"
  const railBottomActive = railSide === "II"

  // Rail defect span: 6.0 m to 13.8 m out of 18.07 m
  const defectStartFrac = 6.0 / 18.07
  const defectEndFrac = 13.8 / 18.07
  const defectX = trackX + trackW * defectStartFrac
  const defectW = trackW * (defectEndFrac - defectStartFrac)

  // Distance ticks across 18.07 m
  const majorTicks = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18.07]
  const minorTicks = [1, 3, 5, 7, 9, 11, 13, 15, 17]

  const scrubberDistance = scrubberX !== null ? (((scrubberX - trackX) / trackW) * 18.07) : 0
  const scrubberPulse = Math.round(scrubberDistance / 0.014835)
  const scrubberInDefect = scrubberDistance >= 6.0 && scrubberDistance <= 13.8

  return (
    <div className="relative w-full">
      {/* Rail Mode Control Header */}
      {isRailMode && (
        <div className="sticky left-0 top-0 z-20 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/95 backdrop-blur-xs px-3 py-2 text-xs shadow-xs" style={{ width: "min(100%, 1200px)" }}>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            <span className="font-bold text-slate-800">Continuous 1-Second Track Ribbon</span>
            <span className="rounded-full bg-white px-2.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600 shadow-xs">
              18.07 m @ 64.8 km/h · 1,218 Pulses (10 kHz)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-500">
              {inspectRailBed ? "Track Bed Focus · Train Departed" : "Consist Over Track View"}
            </span>
            <button
              type="button"
              onClick={() => setForceTrainVisible(!forceTrainVisible)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-xs transition hover:bg-slate-100 hover:text-slate-950 active:scale-95"
            >
              {inspectRailBed ? "🚆 Drive Train Back Onto Track" : "🛤️ Run Train Off Track & Inspect Rail"}
            </button>
          </div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-auto w-full max-w-none select-none"
        role="img"
        aria-label={`Train digital twin showing ${subsystem} subsystem status`}
        onMouseMove={(e) => {
          if (!inspectRailBed) return
          const rect = e.currentTarget.getBoundingClientRect()
          const svgX = ((e.clientX - rect.left) / rect.width) * VIEW_W
          if (svgX >= trackX && svgX <= trackX + trackW) {
            setScrubberX(svgX)
          } else {
            setScrubberX(null)
          }
        }}
        onMouseLeave={() => setScrubberX(null)}
      >
        <defs>
          <linearGradient id="bodyNeutralGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>

          <linearGradient id="bodyNominalGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>

          <linearGradient id="bodyIssueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor="#fff1f2" />
            <stop offset="100%" stopColor="#fee2e2" />
          </linearGradient>

          <linearGradient id="bodyReviewGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor="#fffbeb" />
            <stop offset="100%" stopColor="#fef3c7" />
          </linearGradient>

          <linearGradient id="roofGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>

          <linearGradient id="trackGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="50%" stopColor="#e2e8f0" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>

          <pattern id="corrugationHatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#ef4444" strokeWidth="4" />
            <line x1="5" y1="0" x2="5" y2="10" stroke="#fca5a5" strokeWidth="2" />
          </pattern>

          <filter id="carShadow" x="-10%" y="-20%" width="120%" height="150%">
            <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#0f172a" floodOpacity="0.12" />
          </filter>

          <filter id="glowDefect" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* ------------------------------------------------------------- */}
        {/* TRACK BED & RAIL STRETCH (HERO ELEMENT IN RAIL INSPECTION MODE) */}
        {/* ------------------------------------------------------------- */}
        <motion.g
          initial={false}
          animate={{
            y: inspectRailBed ? -50 : 0,
          }}
          transition={{
            duration: 0.8,
            delay: inspectRailBed ? 0.35 : 0,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          {/* Defect Boundary Guidelines in Inspection Mode */}
          {inspectRailBed && railTopActive && (
            <g>
              {/* Boundary vertical lines */}
              <line x1={defectX} y1={70} x2={defectX} y2={220} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 3" />
              <line x1={defectX + defectW} y1={70} x2={defectX + defectW} y2={220} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 3" />

              {/* Start & End boundary tags */}
              <text x={defectX - 6} y={64} textAnchor="end" fontSize="10" fontWeight={700} fill="#ef4444">
                6.00 m (Defect Start)
              </text>
              <text x={defectX + defectW + 6} y={64} textAnchor="start" fontSize="10" fontWeight={700} fill="#ef4444">
                13.80 m (Defect End)
              </text>

              {/* Dimension measurement line */}
              <line x1={defectX} y1={72} x2={defectX + defectW} y2={72} stroke="#ef4444" strokeWidth={1.5} />
              <polygon points={`${defectX},72 ${defectX + 7},69 ${defectX + 7},75`} fill="#ef4444" />
              <polygon points={`${defectX + defectW},72 ${defectX + defectW - 7},69 ${defectX + defectW - 7},75`} fill="#ef4444" />

              {/* Dimension callout badge */}
              <rect
                x={defectX + defectW / 2 - 170}
                y={46}
                width={340}
                height={22}
                rx={6}
                fill="#ef4444"
                filter="url(#carShadow)"
              />
              <text
                x={defectX + defectW / 2}
                y={61}
                textAnchor="middle"
                fontSize="11"
                fontWeight={700}
                fill="#ffffff"
              >
                ⚠️ Side I Corrugation Zone · 7.80 m Span (6.00 m – 13.80 m)
              </text>
            </g>
          )}

          {/* Ballast bed background */}
          <rect
            x={trackX}
            y={inspectRailBed ? 100 : 218}
            width={trackW}
            height={inspectRailBed ? 116 : 32}
            rx={8}
            fill="url(#trackGrad)"
            stroke="#cbd5e1"
            strokeWidth={inspectRailBed ? 1.5 : 1}
          />

          {/* Concrete Sleepers (Ties) */}
          {Array.from({ length: Math.round(trackW / (inspectRailBed ? 18 : 22)) }).map((_, i) => {
            const sleeperX = trackX + 6 + i * (inspectRailBed ? 18 : 22)
            return (
              <g key={i}>
                <rect
                  x={sleeperX}
                  y={inspectRailBed ? 105 : 222}
                  width={inspectRailBed ? 8 : 6}
                  height={inspectRailBed ? 106 : 24}
                  rx={2}
                  fill="#94a3b8"
                  opacity={inspectRailBed ? 0.75 : 0.6}
                />
                {inspectRailBed && (
                  <>
                    <rect x={sleeperX - 1} y={118} width={10} height={4} rx={1} fill="#475569" />
                    <rect x={sleeperX - 1} y={172} width={10} height={4} rx={1} fill="#475569" />
                  </>
                )}
              </g>
            )
          })}

          {/* TOP RAIL: Left Rail (Side I) */}
          <rect
            x={trackX}
            y={inspectRailBed ? 122 : 228}
            width={trackW}
            height={inspectRailBed ? 14 : 5}
            rx={inspectRailBed ? 4 : 2}
            fill="#475569"
          />

          {/* BOTTOM RAIL: Right Rail (Side II) */}
          <rect
            x={trackX}
            y={inspectRailBed ? 176 : 242}
            width={trackW}
            height={inspectRailBed ? 14 : 5}
            rx={inspectRailBed ? 4 : 2}
            fill="#475569"
          />

          {/* CORRUGATION DEFECT HIGHLIGHT ON SIDE I */}
          {railTopActive && (
            <g>
              {/* Glowing underlay on Side I */}
              <rect
                x={defectX - 4}
                y={inspectRailBed ? 116 : 224}
                width={defectW + 8}
                height={inspectRailBed ? 26 : 13}
                rx={6}
                fill="#ef4444"
                opacity={0.4}
                filter="url(#glowDefect)"
              />
              {/* Textured washboard ripple defect bar */}
              <rect
                x={defectX}
                y={inspectRailBed ? 122 : 228}
                width={defectW}
                height={inspectRailBed ? 14 : 5}
                rx={inspectRailBed ? 4 : 2}
                fill="url(#corrugationHatch)"
                stroke="#dc2626"
                strokeWidth={1.5}
              />
              {/* Realistic sinusoidal physical corrugation waves on rail head */}
              {inspectRailBed && (
                <>
                  <path
                    d={generateCorrugationWave(defectX, defectW, 124, 3, 12)}
                    stroke="#991b1b"
                    strokeWidth={2}
                    fill="none"
                  />
                  <path
                    d={generateCorrugationWave(defectX, defectW, 134, 3, 12)}
                    stroke="#991b1b"
                    strokeWidth={2}
                    fill="none"
                  />
                </>
              )}
            </g>
          )}

          {/* Rail Side Identifiers and Status Badges */}
          {inspectRailBed ? (
            <g>
              <g>
                <rect x={trackX + 12} y={108} width={188} height={20} rx={4} fill="#fee2e2" stroke="#fca5a5" strokeWidth={1} />
                <text x={trackX + 20} y={122} fontSize="10.5" fontWeight={700} fill={railTopActive ? "#dc2626" : "#475569"}>
                  Left Rail (Side I) {railTopActive ? "⚠️ CORRUGATED" : "✓ Nominal"}
                </text>
              </g>

              <g>
                <rect x={trackX + 12} y={162} width={188} height={20} rx={4} fill="#ecfdf5" stroke="#a7f3d0" strokeWidth={1} />
                <text x={trackX + 20} y={176} fontSize="10.5" fontWeight={700} fill={railBottomActive ? "#dc2626" : "#059669"}>
                  Right Rail (Side II) {railBottomActive ? "⚠️ CORRUGATED" : "✓ SMOOTH"}
                </text>
              </g>

              {/* High-Resolution Distance Ruler */}
              <line x1={trackX} y1={224} x2={trackX + trackW} y2={224} stroke="#64748b" strokeWidth={1.5} />
              
              {/* Highlight defect span along distance axis */}
              {railTopActive && (
                <line x1={defectX} y1={224} x2={defectX + defectW} y2={224} stroke="#ef4444" strokeWidth={3.5} />
              )}

              {/* Minor ticks (every 1 m) */}
              {minorTicks.map((dist) => {
                const tickX = trackX + trackW * (dist / 18.07)
                return <line key={`min-${dist}`} x1={tickX} y1={224} x2={tickX} y2={228} stroke="#94a3b8" strokeWidth={1} />
              })}

              {/* Major ticks (every 2 m + ends) */}
              {majorTicks.map((dist) => {
                const tickX = trackX + trackW * (dist / 18.07)
                const isDefectBoundary = dist === 6 || dist === 14
                return (
                  <g key={`maj-${dist}`}>
                    <line
                      x1={tickX}
                      y1={224}
                      x2={tickX}
                      y2={232}
                      stroke={isDefectBoundary ? "#ef4444" : "#64748b"}
                      strokeWidth={1.5}
                    />
                    <text
                      x={tickX}
                      y={245}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight={isDefectBoundary ? 700 : 600}
                      fill={isDefectBoundary ? "#ef4444" : "#475569"}
                    >
                      {dist.toFixed(dist === 18.07 ? 2 : 0)} m
                    </text>
                  </g>
                )
              })}

              {/* Interactive Scrubber Tooltip */}
              {scrubberX !== null && (
                <g>
                  <line x1={scrubberX} y1={40} x2={scrubberX} y2={250} stroke="#2563eb" strokeWidth={1.5} strokeDasharray="3 3" />
                  <circle cx={scrubberX} cy={129} r={4.5} fill="#2563eb" />
                  <circle cx={scrubberX} cy={183} r={4.5} fill="#2563eb" />
                  
                  {/* Floating HUD Badge */}
                  <rect
                    x={Math.max(trackX, Math.min(trackX + trackW - 220, scrubberX - 110))}
                    y={254}
                    width={220}
                    height={38}
                    rx={6}
                    fill="#0f172a"
                    filter="url(#carShadow)"
                  />
                  <text
                    x={Math.max(trackX + 110, Math.min(trackX + trackW - 110, scrubberX))}
                    y={268}
                    textAnchor="middle"
                    fontSize="10.5"
                    fontWeight={700}
                    fill="#ffffff"
                  >
                    {`Position: ${scrubberDistance.toFixed(2)} m (Pulse ${scrubberPulse})`}
                  </text>
                  <text
                    x={Math.max(trackX + 110, Math.min(trackX + trackW - 110, scrubberX))}
                    y={284}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight={700}
                    fill={scrubberInDefect ? "#f87171" : "#4ade80"}
                  >
                    {scrubberInDefect
                      ? "⚠️ DEFECT: Corrugation · 0.15mm Grinding Req."
                      : "✓ NOMINAL: Smooth Track Profile (0.28g RMS)"}
                  </text>
                </g>
              )}
            </g>
          ) : (
            railSide && (
              <text x={trackX} y={262} fontSize="11" fill="#ef4444" fontWeight={600}>
                {`Side ${railSide} corrugation · 0.0 m → 18.07 m traversed`}
              </text>
            )
          )}
        </motion.g>

        {/* ------------------------------------------------------------- */}
        {/* THE TRAIN CONSIST (ANIMATES COMPLETELY AWAY IN RAIL MODE)     */}
        {/* ------------------------------------------------------------- */}
        <motion.g
          id="train-consist-group"
          initial={false}
          animate={{
            x: inspectRailBed ? -(VIEW_W + 500) : 0,
            opacity: inspectRailBed ? [1, 1, 0.85, 0] : 1,
          }}
          transition={{
            x: {
              duration: 1.25,
              ease: inspectRailBed ? [0.38, 0, 0.25, 1] : [0.16, 1, 0.3, 1],
            },
            opacity: {
              duration: inspectRailBed ? 1.25 : 0.4,
              times: [0, 0.65, 0.88, 1],
            },
          }}
          style={{
            pointerEvents: inspectRailBed ? "none" : "auto",
          }}
        >
          {cars.map((car, i) => (
            <Car
              key={car.id}
              car={car}
              x={carX(i)}
              isLead={i === 0}
              selected={selectedId === car.id}
              hovered={hoveredId === car.id}
              onHover={onHover}
              onSelect={onSelect}
            />
          ))}
        </motion.g>
      </svg>
    </div>
  )
}

function Car({
  car,
  x,
  isLead,
  selected,
  hovered,
  onHover,
  onSelect,
}: {
  car: CarState
  x: number
  isLead: boolean
  selected: boolean
  hovered: boolean
  onHover: (id: number | null) => void
  onSelect: (id: number | null) => void
}) {
  const meta = CONDITION_META[car.condition]
  const isNeutral = car.condition === "neutral"
  const isIssue = car.condition === "issue"
  const isReview = car.condition === "review"
  const active = isIssue || isReview


  // Realistic light passenger train palette
  const bodyGradId = isIssue ? "url(#bodyIssueGrad)" : isReview ? "url(#bodyReviewGrad)" : isNeutral ? "url(#bodyNeutralGrad)" : "url(#bodyNominalGrad)"
  const outlineColor = isIssue ? "#ef4444" : isReview ? "#f59e0b" : selected ? "#0f172a" : isNeutral ? "#cbd5e1" : "#94a3b8"
  const outlineW = selected ? 3.5 : active ? 2.5 : 1.2

  // Door layout
  const dzS = x + (isLead ? 72 : 24)
  const dzE = x + CAR_W - 22
  const zoneW = dzE - dzS
  const doorCenters = [0, 1, 2, 3].map((d) => dzS + (zoneW * (d + 0.5)) / 4)
  const doorTop = 82
  const doorH = 82
  const doorW = 24

  return (
    <motion.g
      animate={{ y: hovered ? -8 : 0 }}
      transition={{ type: "spring", stiffness: 450, damping: 28 }}
      style={{ cursor: "pointer" }}
      onMouseEnter={() => onHover(car.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(selected ? null : car.id)}
    >
      <g filter="url(#carShadow)">
        {/* Roof */}
        <rect x={x + 12} y={ROOF_Y} width={CAR_W - 24} height={ROOF_H + 14} rx={14} fill="url(#roofGrad)" />
        {/* Roof AC Pods */}
        <rect x={x + 30} y={ROOF_Y + 5} width={34} height={9} rx={4.5} fill="#475569" opacity={0.7} />
        <rect x={x + CAR_W - 64} y={ROOF_Y + 5} width={34} height={9} rx={4.5} fill="#475569" opacity={0.7} />

        {/* Realistic Body Shell */}
        <rect
          x={x + 6}
          y={BODY_Y}
          width={CAR_W - 12}
          height={BODY_H}
          rx={22}
          fill={bodyGradId}
          stroke={outlineColor}
          strokeWidth={outlineW}
          style={{ transition: "stroke 0.4s ease, fill 0.4s ease" }}
        />

        {/* Clean SMRT Red / Crimson Livery Stripe */}
        <rect
          x={x + 8}
          y={STRIPE_Y}
          width={CAR_W - 16}
          height={STRIPE_H}
          fill={isNeutral ? "#94a3b8" : "#dc2626"}
          opacity={isNeutral ? 0.6 : 1}
        />

        {/* Lower Skirt */}
        <path
          d={`M ${x + 8} ${SKIRT_Y}
             H ${x + CAR_W - 8}
             V ${BODY_BOTTOM - 12}
             a 12 12 0 0 1 -12 12
             H ${x + 20}
             a 12 12 0 0 1 -12 -12
             Z`}
          fill={isNeutral ? "#94a3b8" : "#334155"}
        />
      </g>

      {/* Windows between doors */}
      {[0, 1, 2].map((g) => {
        const cx = (doorCenters[g] + doorCenters[g + 1]) / 2
        return (
          <g key={g}>
            <rect x={cx - 11} y={76} width={22} height={24} rx={5} fill="#0f172a" opacity={isNeutral ? 0.45 : 0.85} />
            {/* Subtle glass reflection glare */}
            <line x1={cx - 8} y1={78} x2={cx + 5} y2={97} stroke="#ffffff" strokeWidth={1.2} opacity={0.35} />
          </g>
        )
      })}

      {/* Doors — 4 per car */}
      {doorCenters.map((cx, d) => {
        const affected = active && car.affectedDoors?.includes(d + 1)
        return (
          <g key={d}>
            <rect
              x={cx - doorW / 2}
              y={doorTop}
              width={doorW}
              height={doorH}
              rx={5}
              fill={affected ? "#fee2e2" : "#f1f5f9"}
              stroke={affected ? "#ef4444" : "#94a3b8"}
              strokeWidth={affected ? 2.5 : 1}
              style={{ transition: "fill 0.3s ease, stroke 0.3s ease" }}
            />
            <line x1={cx} y1={doorTop + 3} x2={cx} y2={doorTop + doorH - 3} stroke="#94a3b8" strokeWidth={1} opacity={0.6} />
            <rect x={cx - doorW / 2 + 2.5} y={doorTop + 5} width={doorW - 5} height={20} rx={3} fill="#0f172a" opacity={isNeutral ? 0.4 : 0.8} />
            {affected && (
              <circle cx={cx} cy={doorTop + doorH / 2} r={4} fill="#ef4444" />
            )}
          </g>
        )
      })}

      {/* Lead Cab Windshield & Nose */}
      {isLead && (
        <g>
          <path
            d={`M ${x + 14} 70
               a 14 14 0 0 1 14 -14
               H ${x + 60}
               V 112
               H ${x + 14}
               Z`}
            fill="#0f172a"
            opacity={isNeutral ? 0.5 : 0.88}
          />
          <text x={x + 36} y={135} fontSize="9" fontWeight={700} fill="#475569" letterSpacing="1">
            MRT
          </text>
          {/* Headlights */}
          <circle cx={x + 16} cy={164} r={3.5} fill="#fbbf24" />
          <circle cx={x + 32} cy={164} r={3.5} fill="#fbbf24" />
        </g>
      )}

      {/* Bogies / Wheels */}
      {[0.26, 0.74].map((f, i) => (
        <g key={i}>
          <circle cx={x + CAR_W * f} cy={WHEEL_Y} r={11} fill="#334155" />
          <circle cx={x + CAR_W * f} cy={WHEEL_Y} r={5} fill="#cbd5e1" />
        </g>
      ))}

      {/* Car Label */}
      <text
        x={x + CAR_W / 2}
        y={BODY_BOTTOM - 7}
        textAnchor="middle"
        fontSize="12"
        fontWeight={700}
        fill={isNeutral ? "#64748b" : "#ffffff"}
        opacity={0.95}
      >
        {car.label}
      </text>

      {/* Rank Badge for ACV / Priority */}
      {car.rank && active && (
        <g>
          <circle cx={x + CAR_W - 22} cy={ROOF_Y - 2} r={12} fill={meta.color} />
          <text x={x + CAR_W - 22} y={ROOF_Y + 2.5} textAnchor="middle" fontSize="12" fontWeight={700} fill="#ffffff">
            {car.rank}
          </text>
        </g>
      )}
    </motion.g>
  )
}

export function carCenterFraction(index: number, total: number) {
  return (carX(index) + CAR_W / 2) / viewWidth(total)
}

export function trainStageWidth(total: number) {
  return Math.max(760, total * 250)
}
