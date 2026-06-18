"use client"

import { useState } from "react"
import { format } from "date-fns"
import type { DriftTimelinePoint } from "@/types/type"
import { Card, CardContent } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { DriftBadge } from "@/components/driftAnalyzer/drift-badge"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"
import { ChevronLeft, ChevronRight, Play, Pause } from "lucide-react"

interface DriftTimelineProps {
  driftTimeline: DriftTimelinePoint[]
}

export function DriftTimeline({ driftTimeline }: DriftTimelineProps) {
  const [selectedIndex, setSelectedIndex] = useState(driftTimeline.length - 1)
  const [isPlaying, setIsPlaying] = useState(false)

  if (!driftTimeline || driftTimeline.length < 2) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-gray-500">Not enough snapshots to analyze drift</p>
        </CardContent>
      </Card>
    )
  }

  // Format data for chart
  const chartData = driftTimeline.map((point, index) => ({
    index,
    date: new Date(point.timestamp),
    drift: point.driftScore,
    newResults: point.newResults,
    droppedResults: point.droppedResults,
  }))

  const selectedPoint = driftTimeline[selectedIndex]

  // Handle animation
  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false)
      return
    }

    setIsPlaying(true)
    let currentIndex = selectedIndex

    const interval = setInterval(() => {
      currentIndex++
      if (currentIndex >= driftTimeline.length) {
        clearInterval(interval)
        setIsPlaying(false)
        return
      }

      setSelectedIndex(currentIndex)
    }, 1000)

    return () => clearInterval(interval)
  }

  // Navigation handlers
  const goToPrevious = () => {
    if (selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1)
    }
  }

  const goToNext = () => {
    if (selectedIndex < driftTimeline.length - 1) {
      setSelectedIndex(selectedIndex + 1)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(date) => format(date, "MMM d")} />
                <YAxis domain={[0, 100]} />
                <Tooltip
                  formatter={(value: number) => [`${value.toFixed(1)}`, "Drift Score"]}
                  labelFormatter={(date: Date) => format(date, "MMM d, yyyy")}
                />
                <Line type="monotone" dataKey="drift" stroke="#2563eb" strokeWidth={2} activeDot={{ r: 8 }} />
                <ReferenceLine
                  x={chartData[selectedIndex].date.getTime()}
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">{format(new Date(driftTimeline[0].timestamp), "MMM d, yyyy")}</div>
              <div className="text-sm text-gray-500">
                {format(new Date(driftTimeline[driftTimeline.length - 1].timestamp), "MMM d, yyyy")}
              </div>
            </div>

            <Slider
              value={[selectedIndex]}
              min={0}
              max={driftTimeline.length - 1}
              step={1}
              onValueChange={(value) => setSelectedIndex(value[0])}
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={goToPrevious} disabled={selectedIndex === 0}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={togglePlay}>
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={goToNext}
                  disabled={selectedIndex === driftTimeline.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{format(new Date(selectedPoint.timestamp), "MMM d, yyyy")}</span>
                <DriftBadge driftScore={selectedPoint.driftScore} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-medium mb-4">Drift Details</h3>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-3 border rounded-lg">
              <div className="text-sm text-gray-500">Drift Score</div>
              <div className="text-2xl font-bold">{selectedPoint.driftScore.toFixed(1)}</div>
            </div>

            <div className="p-3 border rounded-lg">
              <div className="text-sm text-gray-500">New Results</div>
              <div className="text-2xl font-bold">{selectedPoint.newResults}</div>
            </div>

            <div className="p-3 border rounded-lg">
              <div className="text-sm text-gray-500">Dropped Results</div>
              <div className="text-2xl font-bold">{selectedPoint.droppedResults}</div>
            </div>
          </div>

          <h4 className="text-md font-medium mt-6 mb-3">Rank Changes</h4>

          <div className="space-y-3 max-h-80 overflow-y-auto">
            {selectedPoint.rankChanges.length > 0 ? (
              selectedPoint.rankChanges.map((change, index) => (
                <div key={index} className="flex items-center gap-4 p-3 border rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{change.title}</p>
                    <p className="text-xs text-gray-500 truncate">{change.url}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">
                      #{change.previousPosition} → #{change.currentPosition}
                    </div>
                    <div
                      className={`text-sm font-medium ${
                        change.positionDelta > 0
                          ? "text-emerald-600"
                          : change.positionDelta < 0
                            ? "text-red-600"
                            : "text-gray-500"
                      }`}
                    >
                      {change.positionDelta > 0 ? `+${change.positionDelta}` : change.positionDelta}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-gray-500">No rank changes detected</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
