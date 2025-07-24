"use client"

import type { DriftTimelinePoint } from "@/lib/type";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts"
import { format } from "date-fns"

interface DriftSparklineProps {
  driftTimeline: DriftTimelinePoint[]
  height?: number
  showTooltip?: boolean
}

export function DriftSparkline({ driftTimeline, height = 40, showTooltip = false }: DriftSparklineProps) {
  if (!driftTimeline || driftTimeline.length < 2) {
    return <div className="text-xs text-gray-400">Not enough data</div>
  }

  // Format data for chart
  const data = driftTimeline.map((point) => ({
    date: new Date(point.timestamp),
    drift: point.driftScore,
  }))

  // Determine color based on average drift
  const avgDrift = data.reduce((sum, item) => sum + item.drift, 0) / data.length
  let lineColor = "#10b981" // Green for stable

  if (avgDrift > 50) {
    lineColor = "#ef4444" // Red for volatile
  } else if (avgDrift > 20) {
    lineColor = "#f59e0b" // Amber for medium
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="drift"
          stroke={lineColor}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        {showTooltip && (
          <Tooltip
            formatter={(value: number) => [`${value.toFixed(1)}`, "Drift Score"]}
            labelFormatter={(date: Date) => format(date, "MMM d, yyyy")}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
