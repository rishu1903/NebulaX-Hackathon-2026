"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { CONDITION_META, type CarState, type Subsystem } from "@/lib/fault-disruptors/data"
import type { RailHotspot } from "@/lib/fault-disruptors/live"

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
const VIEW_H = 300

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
  railDistanceM?: number | null
  railHotspot?: RailHotspot | null
  selectedId: number | null
  hoveredId: number | null
  onHover: (id: number | null) => void
  onSelect: (id: number | null) => void
}

export function TrainTwin({ subsystem, cars, railSide, railDistanceM, railHotspot, selectedId, hoveredId, onHover, onSelect }: Props) {
  const total = cars.length
  const VIEW_W = viewWidth(total)
  const trackX = MARGIN_X - 40
  const trackW = total * CAR_W + (total - 1) * GAP + 80

  const [showTrainContext, setShowTrainContext] = useState(false)
  const isRailMode = subsystem === "RAIL"
  const inspectRailBed = isRailMode && !showTrainContext
  const viewHeight = inspectRailBed ? 260 : VIEW_H
  const [scrubberX, setScrubberX] = useState<number | null>(null)

  const railTopActive = railSide === "I"
  const railBottomActive = railSide === "II"
  const scrubberPercent =
    scrubberX === null ? 0 : Math.max(0, Math.min(100, ((scrubberX - trackX) / trackW) * 100))
  const hasHotspot = Boolean(railHotspot && railDistanceM && railDistanceM > 0)
  const hotspotStartPercent = hasHotspot
    ? Math.max(0, Math.min(100, (railHotspot!.startM / railDistanceM!) * 100))
    : 0
  const hotspotEndPercent = hasHotspot
    ? Math.max(hotspotStartPercent, Math.min(100, (railHotspot!.endM / railDistanceM!) * 100))
    : 100
  const hotspotCenterX = trackX + trackW * ((hotspotStartPercent + hotspotEndPercent) / 200)
  const rawHotspotWidth = trackW * ((hotspotEndPercent - hotspotStartPercent) / 100)
  const hotspotWidth = hasHotspot ? Math.min(trackW, Math.max(28, rawHotspotWidth)) : trackW
  const hotspotX = Math.max(trackX, Math.min(trackX + trackW - hotspotWidth, hotspotCenterX - hotspotWidth / 2))
  const scrubberDistanceM = railDistanceM === null || railDistanceM === undefined
    ? null
    : railDistanceM * (scrubberPercent / 100)
  const scrubberInHotspot = Boolean(
    railHotspot && scrubberDistanceM !== null &&
    scrubberDistanceM >= railHotspot.startM && scrubberDistanceM <= railHotspot.endM,
  )

  return (
    <div className="relative w-full">
      {isRailMode && (
        <div
          className="sticky left-0 top-0 z-20 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/95 px-3 py-2 text-xs shadow-xs backdrop-blur-xs"
          style={{ width: "min(100%, 1200px)" }}
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>

            <span className="font-bold text-slate-800">Recorded Track Window</span>

            <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 shadow-xs">
              {railDistanceM === null || railDistanceM === undefined ? "Side I / Side II classification" : `${railDistanceM.toFixed(2)} m measured window`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-500">
              {inspectRailBed ? "Rail-side inspection view" : "Train context view"}
            </span>

            <button
              type="button"
              onClick={() => setShowTrainContext(!showTrainContext)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-xs transition hover:bg-slate-100 hover:text-slate-950 active:scale-95"
            >
              {inspectRailBed ? "🚆 Show train context" : "🛤️ Focus on rail view"}
            </button>
          </div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${VIEW_W} ${viewHeight}`}
        className="h-auto w-full max-w-none select-none"
        role="img"
        aria-label={`Train digital twin showing ${subsystem} subsystem status`}
        onMouseMove={(event) => {
          if (!inspectRailBed) return

          const rect = event.currentTarget.getBoundingClientRect()
          const svgX = ((event.clientX - rect.left) / rect.width) * VIEW_W

          setScrubberX(svgX >= trackX && svgX <= trackX + trackW ? svgX : null)
        }}
        onMouseLeave={() => setScrubberX(null)}
      >
        <defs>
          <linearGradient id="trackGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="50%" stopColor="#e2e8f0" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>

          <pattern
            id="corrugationHatch"
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
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

        <motion.g
          initial={false}
          animate={{ y: inspectRailBed ? -50 : 0 }}
          transition={{
            duration: 0.65,
            delay: inspectRailBed ? 0.08 : 0,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          {inspectRailBed && railSide && (
            <g>
              <rect
                x={trackX + trackW / 2 - 145}
                y={46}
                width={290}
                height={22}
                rx={6}
                fill="#ef4444"
                filter="url(#carShadow)"
              />

              <text
                x={trackX + trackW / 2}
                y={61}
                textAnchor="middle"
                fontSize="11"
                fontWeight={700}
                fill="#ffffff"
              >
                {railHotspot
                  ? `Side ${railSide} hotspot · ${railHotspot.startM.toFixed(2)}–${railHotspot.endM.toFixed(2)} m`
                  : `Model classification: Side ${railSide} corrugation`}
              </text>
            </g>
          )}

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

          {Array.from({ length: Math.round(trackW / 20) }).map((_, i) => {
            const sleeperX = trackX + 6 + i * 20

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

          <rect
            x={trackX}
            y={inspectRailBed ? 122 : 228}
            width={trackW}
            height={inspectRailBed ? 14 : 5}
            rx={inspectRailBed ? 4 : 2}
            fill="#475569"
          />

          <rect
            x={trackX}
            y={inspectRailBed ? 176 : 242}
            width={trackW}
            height={inspectRailBed ? 14 : 5}
            rx={inspectRailBed ? 4 : 2}
            fill="#475569"
          />

          {railTopActive && (
            <RailHighlight
              x={hotspotX}
              width={hotspotWidth}
              y={inspectRailBed ? 122 : 228}
              large={inspectRailBed}
            />
          )}

          {railBottomActive && (
            <RailHighlight
              x={hotspotX}
              width={hotspotWidth}
              y={inspectRailBed ? 176 : 242}
              large={inspectRailBed}
            />
          )}

          {inspectRailBed ? (
            <g>
              <RailLabel
                x={trackX + 12}
                y={108}
                label="Left Rail (Side I)"
                active={railTopActive}
              />

              <RailLabel
                x={trackX + 12}
                y={162}
                label="Right Rail (Side II)"
                active={railBottomActive}
              />

              <text x={trackX} y={220} fontSize="9.5" fontWeight={600} fill="#64748b">
                Recorded sensor window
              </text>

              <line
                x1={trackX}
                y1={224}
                x2={trackX + trackW}
                y2={224}
                stroke="#64748b"
                strokeWidth={1.5}
              />

              {[0, 25, 50, 75, 100].map((percent) => {
                const tickX = trackX + trackW * (percent / 100)

                return (
                  <g key={percent}>
                    <line
                      x1={tickX}
                      y1={224}
                      x2={tickX}
                      y2={232}
                      stroke="#64748b"
                      strokeWidth={1.25}
                    />

                    <text
                      x={tickX}
                      y={245}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight={600}
                      fill="#475569"
                    >
                      {railDistanceM === null || railDistanceM === undefined
                        ? `${percent}%`
                        : `${(railDistanceM * percent / 100).toFixed(percent === 0 ? 1 : 2)} m`}
                    </text>
                  </g>
                )
              })}

              {scrubberX !== null && (
                <g>
                  <line
                    x1={scrubberX}
                    y1={76}
                    x2={scrubberX}
                    y2={250}
                    stroke="#2563eb"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                  />

                  <circle cx={scrubberX} cy={129} r={4.5} fill="#2563eb" />
                  <circle cx={scrubberX} cy={183} r={4.5} fill="#2563eb" />

                  <rect
                    x={Math.max(trackX, Math.min(trackX + trackW - 250, scrubberX - 125))}
                    y={254}
                    width={250}
                    height={38}
                    rx={6}
                    fill="#0f172a"
                    filter="url(#carShadow)"
                  />

                  <text
                    x={Math.max(trackX + 125, Math.min(trackX + trackW - 125, scrubberX))}
                    y={268}
                    textAnchor="middle"
                    fontSize="10.5"
                    fontWeight={700}
                    fill="#ffffff"
                  >
                    {scrubberDistanceM === null
                      ? `Recording position: ${scrubberPercent.toFixed(0)}%`
                      : `Recording position: ${scrubberDistanceM.toFixed(2)} m`}
                  </text>

                  <text
                    x={Math.max(trackX + 125, Math.min(trackX + trackW - 125, scrubberX))}
                    y={284}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight={600}
                    fill={scrubberInHotspot ? "#fca5a5" : "#cbd5e1"}
                  >
                    {railSide && railHotspot
                      ? scrubberInHotspot
                        ? `Inside estimated Side ${railSide} hotspot`
                        : `Outside estimated hotspot`
                      : railSide
                        ? `Side ${railSide} is classified for the uploaded window`
                      : "No rail side is highlighted in this view"}
                  </text>
                </g>
              )}
            </g>
          ) : (
            railSide && (
              <text x={trackX} y={262} fontSize="11" fill="#ef4444" fontWeight={600}>
                {`Side ${railSide} corrugation classification for the uploaded recording`}
              </text>
            )
          )}
        </motion.g>

        <motion.g
          id="train-consist-group"
          initial={false}
          animate={{
            x: inspectRailBed ? -(VIEW_W + 500) : 0,
            opacity: inspectRailBed ? 0 : 1,
          }}
          transition={{
            duration: 0.75,
            ease: [0.16, 1, 0.3, 1],
          }}
          style={{
            pointerEvents: inspectRailBed ? "none" : "auto",
            willChange: "transform",
          }}
        >
          {cars.map((car, i) => (
            <Car
              key={car.id}
              car={car}
              x={carX(i)}
              isLead={i === 0}
              showRank={subsystem === "ACV"}
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

function RailHighlight({
  x,
  width,
  y,
  large,
}: {
  x: number
  width: number
  y: number
  large: boolean
}) {
  return (
    <g>
      <rect
        x={x - 4}
        y={y - (large ? 6 : 4)}
        width={width + 8}
        height={large ? 26 : 13}
        rx={6}
        fill="#ef4444"
        opacity={0.35}
        filter="url(#glowDefect)"
      />

      <rect
        x={x}
        y={y}
        width={width}
        height={large ? 14 : 5}
        rx={large ? 4 : 2}
        fill="url(#corrugationHatch)"
        stroke="#dc2626"
        strokeWidth={1.5}
      />
    </g>
  )
}

function RailLabel({
  x,
  y,
  label,
  active,
}: {
  x: number
  y: number
  label: string
  active: boolean
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={210}
        height={20}
        rx={4}
        fill={active ? "#fee2e2" : "#ffffff"}
        stroke={active ? "#fca5a5" : "#cbd5e1"}
        strokeWidth={1}
      />

      <text
        x={x + 8}
        y={y + 14}
        fontSize="10.5"
        fontWeight={700}
        fill={active ? "#dc2626" : "#475569"}
      >
        {active ? `${label} · CORRUGATION FLAGGED` : label}
      </text>
    </g>
  )
}

function Car({
  car,
  x,
  isLead,
  showRank,
  selected,
  hovered,
  onHover,
  onSelect,
}: {
  car: CarState
  x: number
  isLead: boolean
  showRank: boolean
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

  const gradientId = `car-body-${car.id}`
  const roofGradientId = `car-roof-${car.id}`

  const bodyStops =
    isIssue
      ? ["#ffffff", "#fee2e2"]
      : isReview
        ? ["#ffffff", "#fef3c7"]
        : isNeutral
          ? ["#ffffff", "#e2e8f0"]
          : ["#ffffff", "#e2e8f0"]

  const outlineColor =
    isIssue
      ? "#ef4444"
      : isReview
        ? "#f59e0b"
        : selected
          ? "#0f172a"
          : isNeutral
            ? "#cbd5e1"
            : "#94a3b8"

  const outlineW = selected ? 3.5 : active ? 2.5 : 1.2

  const dzS = x + (isLead ? 72 : 24)
  const dzE = x + CAR_W - 22
  const zoneW = dzE - dzS
  const doorCenters = [0, 1, 2, 3].map((d) => dzS + (zoneW * (d + 0.5)) / 4)
  const doorTop = 82
  const doorH = 82
  const doorW = 24
  const overlayMeta = car.overlay ? CONDITION_META[car.overlay.condition] : null

  return (
    <motion.g
      animate={{ y: hovered ? -8 : 0 }}
      transition={{
        type: "spring",
        stiffness: 450,
        damping: 28,
      }}
      style={{ cursor: "pointer" }}
      onMouseEnter={() => onHover(car.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(selected ? null : car.id)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={bodyStops[0]} />
          <stop offset="100%" stopColor={bodyStops[1]} />
        </linearGradient>

        <linearGradient id={roofGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>
      </defs>

      <g filter="url(#carShadow)">
        <rect
          x={x + 12}
          y={ROOF_Y}
          width={CAR_W - 24}
          height={ROOF_H + 14}
          rx={14}
          fill={`url(#${roofGradientId})`}
        />

        <rect
          x={x + 30}
          y={ROOF_Y + 5}
          width={34}
          height={9}
          rx={4.5}
          fill="#475569"
          opacity={0.7}
        />

        <rect
          x={x + CAR_W - 64}
          y={ROOF_Y + 5}
          width={34}
          height={9}
          rx={4.5}
          fill="#475569"
          opacity={0.7}
        />

        <rect
          x={x + 6}
          y={BODY_Y}
          width={CAR_W - 12}
          height={BODY_H}
          rx={22}
          fill={`url(#${gradientId})`}
          stroke={outlineColor}
          strokeWidth={outlineW}
          style={{ transition: "stroke 0.4s ease, fill 0.4s ease" }}
        />

        {car.overlay?.kind === "structure" && overlayMeta && (
          <g>
            <rect x={x + 18} y={BODY_Y + 8} width={CAR_W - 36} height={BODY_H - 28} rx={9} fill="#ffffff" fillOpacity={0.34} stroke="#94a3b8" strokeDasharray="4 3" />
            <line x1={x + 76} y1={BODY_Y + 8} x2={x + 76} y2={BODY_BOTTOM - 20} stroke="#94a3b8" strokeDasharray="3 3" />
            <line x1={x + 144} y1={BODY_Y + 8} x2={x + 144} y2={BODY_BOTTOM - 20} stroke="#94a3b8" strokeDasharray="3 3" />
            <rect x={x + 76} y={BODY_Y + 8} width={68} height={BODY_H - 28} fill={overlayMeta.soft} stroke={overlayMeta.color} strokeWidth={3} />
            <rect x={x + 22} y={BODY_Y + 12} width={48} height={13} rx={3} fill="#ffffff" fillOpacity={0.82} />
            <text x={x + 46} y={BODY_Y + 21.5} textAnchor="middle" fontSize="7" fontWeight={800} fill="#64748b">FRONT</text>
            <rect x={x + 84} y={BODY_Y + 12} width={52} height={13} rx={3} fill={overlayMeta.color} />
            <text x={x + 110} y={BODY_Y + 21.5} textAnchor="middle" fontSize="7" fontWeight={800} fill="#ffffff">CENTRE</text>
            <rect x={x + 150} y={BODY_Y + 12} width={46} height={13} rx={3} fill="#ffffff" fillOpacity={0.82} />
            <text x={x + 173} y={BODY_Y + 21.5} textAnchor="middle" fontSize="7" fontWeight={800} fill="#64748b">REAR</text>
            <rect x={x + 24} y={174} width={CAR_W - 48} height={13} rx={3} fill="#ffffff" fillOpacity={0.82} stroke="#94a3b8" strokeDasharray="3 2" />
            <text x={x + CAR_W / 2} y={183} textAnchor="middle" fontSize="7" fontWeight={800} fill="#64748b">UNDERFRAME</text>
          </g>
        )}

        <rect
          x={x + 8}
          y={STRIPE_Y}
          width={CAR_W - 16}
          height={STRIPE_H}
          fill={isNeutral ? "#94a3b8" : "#dc2626"}
          opacity={isNeutral ? 0.6 : 1}
        />

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

      {car.overlay?.kind !== "structure" && [0, 1, 2].map((g) => {
        const cx = (doorCenters[g] + doorCenters[g + 1]) / 2

        return (
          <g key={g}>
            <rect
              x={cx - 11}
              y={76}
              width={22}
              height={24}
              rx={5}
              fill="#0f172a"
              opacity={isNeutral ? 0.45 : 0.85}
            />

            <line
              x1={cx - 8}
              y1={78}
              x2={cx + 5}
              y2={97}
              stroke="#ffffff"
              strokeWidth={1.2}
              opacity={0.35}
            />
          </g>
        )
      })}

      {car.overlay?.kind !== "structure" && doorCenters.map((cx, d) => {
        const highlighted = car.overlay?.kind === "door" && car.overlay.componentIndex === d + 1
        return (
        <g key={d}>
          <rect
            x={cx - doorW / 2}
            y={doorTop}
            width={doorW}
            height={doorH}
            rx={5}
            fill={highlighted && overlayMeta ? overlayMeta.soft : "#f1f5f9"}
            stroke={highlighted && overlayMeta ? overlayMeta.color : "#94a3b8"}
            strokeWidth={highlighted ? 3 : 1}
          />

          <line
            x1={cx}
            y1={doorTop + 3}
            x2={cx}
            y2={doorTop + doorH - 3}
            stroke="#94a3b8"
            strokeWidth={1}
            opacity={0.6}
          />

          <rect
            x={cx - doorW / 2 + 2.5}
            y={doorTop + 5}
            width={doorW - 5}
            height={20}
            rx={3}
            fill="#0f172a"
            opacity={isNeutral ? 0.4 : 0.8}
          />
        </g>
        )
      })}

      {car.overlay && overlayMeta && (
        <g>
          <rect x={x + 46} y={BODY_Y - 14} width={128} height={20} rx={5} fill="#7c3aed" />
          <text x={x + 110} y={BODY_Y} textAnchor="middle" fontSize="9" fontWeight={800} fill="#ffffff">
            {`${car.overlay.label.toUpperCase()} · SHOWCASE`}
          </text>
        </g>
      )}

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

          <text
            x={x + 36}
            y={135}
            fontSize="9"
            fontWeight={700}
            fill="#475569"
            letterSpacing="1"
          >
            MRT
          </text>

          <circle cx={x + 16} cy={164} r={3.5} fill="#fbbf24" />
          <circle cx={x + 32} cy={164} r={3.5} fill="#fbbf24" />
        </g>
      )}

      {[0.26, 0.74].map((f, i) => (
        <g key={i}>
          <circle cx={x + CAR_W * f} cy={WHEEL_Y} r={11} fill="#334155" />
          <circle cx={x + CAR_W * f} cy={WHEEL_Y} r={5} fill="#cbd5e1" />
        </g>
      ))}

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

      {showRank && car.rank && (
        <g>
          <circle
            cx={x + CAR_W - 22}
            cy={ROOF_Y - 2}
            r={12}
            fill={car.rank === 1 ? "#dc2626" : car.rank <= 3 ? "#f59e0b" : "#64748b"}
          />

          <text
            x={x + CAR_W - 22}
            y={ROOF_Y + 2.5}
            textAnchor="middle"
            fontSize="12"
            fontWeight={700}
            fill="#ffffff"
          >
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
  return Math.max(720, total * 92)
}
