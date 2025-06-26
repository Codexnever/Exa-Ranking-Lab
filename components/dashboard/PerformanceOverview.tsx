import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import React from "react"

export default function PerformanceOverview({ analytics }: { analytics: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-gray-900">Performance Overview</CardTitle>
        <CardDescription>Key metrics and trends over the last 30 days</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Volatility Index</span>
              <span className="text-sm font-medium text-gray-900">{analytics?.volatilityIndex.toFixed(1)}</span>
            </div>
            <Progress value={(analytics?.volatilityIndex || 0) * 10} className="h-2" />
            <p className="text-xs text-gray-500">Low volatility indicates stable rankings</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">New Content Discovery</span>
              <span className="text-sm font-medium text-gray-900">{analytics?.newContentDiscovery.toFixed(1)}%</span>
            </div>
            <Progress value={analytics?.newContentDiscovery || 0} className="h-2" />
            <p className="text-xs text-gray-500">Fresh URLs in top 10 results</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Query Success Rate</span>
              <span className="text-sm font-medium text-gray-900">{analytics?.querySuccessRate.toFixed(1)}%</span>
            </div>
            <Progress value={analytics?.querySuccessRate || 0} className="h-2" />
            <p className="text-xs text-gray-500">Successful API responses</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
