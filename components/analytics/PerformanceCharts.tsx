import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Line, BarChart, Bar } from "recharts";

export function PerformanceCharts({ performanceData, successRateByHour }: { performanceData: any[], successRateByHour: any[] }) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900">Performance Metrics</CardTitle>
          <CardDescription>API response times, success rates, and system performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              {performanceData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400">No performance data</div>
              ) : (
                <LineChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis yAxisId="left" tickFormatter={(v) => `${v} ms`} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} />
                  <Tooltip />
                  <Line yAxisId="left" type="monotone" dataKey="responseTime" stroke="#2563eb" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="successRate" stroke="#059669" strokeWidth={2} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900">Success Rate by Hour</CardTitle>
          <CardDescription>Hourly success rate and average response time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              {successRateByHour.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400">No hourly data</div>
              ) : (
                <BarChart data={successRateByHour}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Bar yAxisId="left" dataKey="successRate" fill="#22c55e" name="Success Rate (%)" />
                  <Line yAxisId="right" type="monotone" dataKey="avgTime" stroke="#2563eb" strokeWidth={2} name="Avg Time (s)" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
