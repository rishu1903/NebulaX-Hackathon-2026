"use client"

import { AlertTriangle, CheckCircle2, Circle, CircleAlert } from "lucide-react"
import { type Condition } from "@/lib/fault-disruptors/data"

export function ConditionIcon({ condition, className = "size-4" }: { condition: Condition; className?: string }) {
  if (condition === "issue") return <CircleAlert className={className} aria-hidden="true" />
  if (condition === "review") return <AlertTriangle className={className} aria-hidden="true" />
  if (condition === "normal") return <CheckCircle2 className={className} aria-hidden="true" />
  return <Circle className={className} aria-hidden="true" />
}
