"use client"

import { type CSSProperties } from "react"
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
const VIEW_H = 292

/** Clay-render MRT palette (full colour) and a desaturated variant for the pre-analysis idle shell. */
const CLAY = {
  roof: "#828b99",
  roofHi: "#99a2b0",
  body: "#efe8da",
  bodyHi: "#f7f2e7",
  skirt: "#5c6472",
  stripe: "#dc5532",
  door: "#a7adb8",
  doorEdge: "#8b93a0",
  glass: "#39414c",
  wheel: "#4b5563",
}
const MUTED = {
  roof: "#c4c8cf",
  roofHi: "#d3d7dd",
  body: "#ece9e3",
  bodyHi: "#f3f1ec",
  skirt: "#bcc0c8",
  stripe: "#d6d1c6",
  door: "#cfd3d9",
  doorEdge: "#bdc1c8",
  glass: "#b6bbc3",
  wheel: "#9aa1ab",
}

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

export function TrainTwin({ subsystem, cars, railSide, selectedId, hoveredId, onHover, onSelect }: Props) {
  const total = cars.length
  const VIEW_W = viewWidth(total)
  const trackX = MARGIN_X - 40
  const trackW = total * CAR_W + (total - 1) * GAP + 80

  const railTopActive = railSide === "I"
  const railBottomActive = railSide === "II"

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="h-auto w-full max-w-none select-none"
      role="img"
      aria-label={`Train digital twin showing ${subsystem} subsystem status`}
    >
      <defs>
        <linearGradient id="trackGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e2e6ea" />
          <stop offset="1" stopColor="#cbd2d9" />
        </linearGradient>
        <filter id="carShadow" x="-20%" y="-30%" width="140%" height="170%">
          <feDropShadow dx="0" dy="7" stdDeviation="7" floodColor="#3f3a2e" floodOpacity="0.16" />
        </filter>
      </defs>

      {/* Track bed */}
      <g>
        <rect x={trackX} y={SKIRT_Y + 46} width={trackW} height={22} rx={5} fill="url(#trackGrad)" />
        {Array.from({ length: Math.round(trackW / 22) }).map((_, i) => (
          <rect key={i} x={trackX + 6 + i * 22} y={SKIRT_Y + 49} width={6} height={16} rx={1.5} fill="#b3bcc6" />
        ))}
        <rect
          x={trackX}
          y={SKIRT_Y + 42}
          width={trackW}
          height={6}
          rx={3}
          fill={railTopActive ? "var(--issue)" : "#94a3b8"}
          style={{ transition: "fill 0.5s ease" }}
        />
        <rect
          x={trackX}
          y={SKIRT_Y + 68}
          width={trackW}
          height={6}
          rx={3}
          fill={railBottomActive ? "var(--issue)" : "#94a3b8"}
          style={{ transition: "fill 0.5s ease" }}
        />
        {railSide && (
          <text x={trackX} y={SKIRT_Y + 92} fontSize="11" fill="#ef4444" fontWeight={600}>
            {`Side ${railSide} corrugation detected`}
          </text>
        )}
      </g>

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
    </svg>
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
  const active = car.condition === "issue" || car.condition === "review"
  const P = isNeutral ? MUTED : CLAY

  const lift = hovered ? -7 : 0
  const style: CSSProperties = {
    transition: "transform 0.35s cubic-bezier(0.22,1,0.36,1)",
    transform: `translateY(${lift}px)`,
    cursor: "pointer",
  }

  const outline = active ? meta.color : isNeutral ? "#c7cbd1" : "#d8d0c0"
  const outlineW = selected ? 3.5 : active ? 2.5 : 1.4

  // door layout — 4 doors per car, front zone reserved for the cab on the lead car
  const dzS = x + (isLead ? 72 : 24)
  const dzE = x + CAR_W - 22
  const zoneW = dzE - dzS
  const doorCenters = [0, 1, 2, 3].map((d) => dzS + (zoneW * (d + 0.5)) / 4)
  const doorTop = 82
  const doorH = 82
  const doorW = 24

  return (
    <g
      style={style}
      onMouseEnter={() => onHover(car.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(selected ? null : car.id)}
    >
      <defs>
        <linearGradient id={`bodyGrad-${car.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={P.bodyHi} />
          <stop offset="1" stopColor={P.body} />
        </linearGradient>
        <linearGradient id={`roofGrad-${car.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={P.roofHi} />
          <stop offset="1" stopColor={P.roof} />
        </linearGradient>
      </defs>
      <g filter="url(#carShadow)">
        {/* roof */}
        <rect x={x + 12} y={ROOF_Y} width={CAR_W - 24} height={ROOF_H + 14} rx={14} fill={`url(#roofGrad-${car.id})`} />
        {/* roof AC pods */}
        <rect x={x + 30} y={ROOF_Y + 5} width={34} height={9} rx={4.5} fill={P.roof} opacity={0.65} />
        <rect x={x + CAR_W - 64} y={ROOF_Y + 5} width={34} height={9} rx={4.5} fill={P.roof} opacity={0.65} />

        {/* body shell */}
        <rect
          x={x + 6}
          y={BODY_Y}
          width={CAR_W - 12}
          height={BODY_H}
          rx={22}
          fill={`url(#bodyGrad-${car.id})`}
          stroke={outline}
          strokeWidth={outlineW}
          style={{ transition: "stroke 0.4s ease" }}
        />

        {/* orange-red livery stripe */}
        <rect x={x + 8} y={STRIPE_Y} width={CAR_W - 16} height={STRIPE_H} fill={P.stripe} opacity={isNeutral ? 0.8 : 1} />

        {/* lower skirt */}
        <path
          d={`M ${x + 8} ${SKIRT_Y}
             H ${x + CAR_W - 8}
             V ${BODY_BOTTOM - 12}
             a 12 12 0 0 1 -12 12
             H ${x + 20}
             a 12 12 0 0 1 -12 -12
             Z`}
          fill={P.skirt}
        />
      </g>

      {/* windows between doors */}
      {[0, 1, 2].map((g) => {
        const cx = (doorCenters[g] + doorCenters[g + 1]) / 2
        return (
          <rect key={g} x={cx - 11} y={76} width={22} height={24} rx={6} fill={P.glass} opacity={isNeutral ? 0.55 : 0.9} />
        )
      })}

      {/* doors — 4 per car */}
      {doorCenters.map((cx, d) => {
        return (
        <g key={d}>
          <rect
            x={cx - doorW / 2}
            y={doorTop}
            width={doorW}
            height={doorH}
            rx={5}
            fill={P.door}
            stroke={P.doorEdge}
            strokeWidth={1}
            style={{ transition: "fill 0.3s ease, stroke 0.3s ease" }}
          />
          <line x1={cx} y1={doorTop + 3} x2={cx} y2={doorTop + doorH - 3} stroke={P.doorEdge} strokeWidth={1} opacity={0.6} />
          <rect x={cx - doorW / 2 + 2.5} y={doorTop + 5} width={doorW - 5} height={20} rx={3} fill={P.glass} opacity={isNeutral ? 0.5 : 0.85} />
        </g>
        )
      })}

      {/* lead-car cab: windshield, MRT badge, headlights */}
      {isLead && (
        <g>
          <rect x={x + 15} y={72} width={30} height={26} rx={8} fill={P.glass} opacity={isNeutral ? 0.55 : 0.9} />
          <rect x={x + 14} y={122} width={32} height={18} rx={5} fill={isNeutral ? "#f0efec" : "#ffffff"} stroke={P.doorEdge} strokeWidth={0.75} />
          <text
            x={x + 30}
            y={135.5}
            textAnchor="middle"
            fontSize="10"
            fontWeight={800}
            fill={isNeutral ? "#9aa0a8" : "#d64528"}
            letterSpacing="0.5"
          >
            MRT
          </text>
          <circle cx={x + 20} cy={174} r={4} fill={isNeutral ? "#cfd3d9" : "#f4d488"} />
          <circle cx={x + 40} cy={174} r={4} fill={isNeutral ? "#cfd3d9" : "#f4d488"} />
        </g>
      )}

      {/* condition wash — keeps the clay look but tints flagged cars */}
      {active && (
        <rect
          x={x + 6}
          y={BODY_Y}
          width={CAR_W - 12}
          height={BODY_H}
          rx={22}
          fill={meta.color}
          opacity={car.condition === "issue" ? 0.16 : 0.11}
          pointerEvents="none"
          style={{ transition: "opacity 0.4s ease" }}
        />
      )}

      {/* bogies */}
      {[0.26, 0.74].map((f, i) => (
        <g key={i}>
          <circle cx={x + CAR_W * f} cy={WHEEL_Y} r={11} fill={P.wheel} />
          <circle cx={x + CAR_W * f} cy={WHEEL_Y} r={4.5} fill="#e5e9ee" opacity={0.85} />
        </g>
      ))}

      {/* car label */}
      <text
        x={x + CAR_W / 2}
        y={BODY_BOTTOM - 7}
        textAnchor="middle"
        fontSize="12"
        fontWeight={700}
        fill={isNeutral ? "#e7eaee" : "#ffffff"}
        opacity={0.95}
      >
        {car.label}
      </text>

      {/* rank badge */}
      {car.rank && active && (
        <g style={{ transform: `translateY(${lift}px)` }}>
          <circle cx={x + CAR_W - 22} cy={ROOF_Y - 2} r={12} fill={meta.color} />
          <text x={x + CAR_W - 22} y={ROOF_Y + 2.5} textAnchor="middle" fontSize="12" fontWeight={700} fill="#fff">
            {car.rank}
          </text>
        </g>
      )}
    </g>
  )
}

/** Screen-space X center of a car as a fraction of the viewBox width, given the current consist length. */
export function carCenterFraction(index: number, total: number) {
  return (carX(index) + CAR_W / 2) / viewWidth(total)
}

export function trainStageWidth(total: number) {
  return Math.max(760, total * 250)
}
