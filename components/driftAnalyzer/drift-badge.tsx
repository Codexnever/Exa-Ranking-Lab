import { Badge } from "@/components/ui/badge"

interface DriftBadgeProps {
  driftScore: number
  trend?: "improving" | "worsening" | "stable"
  size?: "sm" | "md" | "lg"
}

export function DriftBadge({ driftScore, trend, size = "md" }: DriftBadgeProps) {
  // Determine badge variant based on drift score
  let variant: "default" | "secondary" | "destructive" | "outline" = "outline"
  let label = "Stable"

  if (driftScore > 50) {
    variant = "destructive"
    label = "High Drift"
  } else if (driftScore > 20) {
    variant = "secondary"
    label = "Medium Drift"
  } else {
    variant = "default"
    label = "Stable"
  }

  // Add trend indicator if provided
  if (trend) {
    const trendSymbol = trend === "improving" ? "↓" : trend === "worsening" ? "↑" : "→"
    label = `${label} ${trendSymbol}`
  }

  const sizeClass = size === "sm" ? "text-xs py-0 px-2" : size === "lg" ? "text-sm py-1 px-3" : ""

  return (
    <Badge variant={variant} className={sizeClass}>
      {label}
    </Badge>
  )
}
