import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { BarChart3, TrendingUp, TrendingDown, Clock, Globe, CheckCircle } from "lucide-react"
import { formatResponseTime } from "@/hooks/format-response-time"
import React from "react"

export default function DashboardStats({ queries, analytics }: { queries: any[]; analytics: any }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-gray-600">Active Queries</CardTitle>
          <BarChart3 className="w-4 h-4 text-blue-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900">{queries.length}</div>
          <p className="text-xs text-emerald-600 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            {queries.filter((q) => q.schedule.enabled).length} scheduled
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-gray-600">Ranking Stability</CardTitle>
          <CheckCircle className="w-4 h-4 text-emerald-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900">{analytics?.rankingStability.toFixed(1)}%</div>
          <Progress value={analytics?.rankingStability || 0} className="mt-2" />
          <p className="text-xs text-gray-500 mt-1">Results maintaining position</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-gray-600">Avg Response Time</CardTitle>
          <Clock className="w-4 h-4 text-violet-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900">{formatResponseTime(analytics?.avgResponseTime ?? 0)}</div>
          <p className="text-xs text-emerald-600 flex items-center gap-1">
            <TrendingDown className="w-3 h-3" />
            -200ms improvement
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-gray-600">Domain Diversity</CardTitle>
          <Globe className="w-4 h-4 text-amber-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900">{analytics?.domainDiversity}</div>
          <p className="text-xs text-gray-500">Unique domains tracked</p>
        </CardContent>
      </Card>
    </div>
  )
}
