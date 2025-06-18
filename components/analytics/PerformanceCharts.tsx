import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { formatResponseTime } from "@/lib/format-response-time";

export function PerformanceCharts({
  performanceData,
  successRateByHour,
}: {
  performanceData: any[];
  successRateByHour: any[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="shadow-xl border border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900 text-lg">⚡ Performance Metrics</CardTitle>
          <CardDescription>
            Real-time API speed and query success analysis.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              {performanceData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  No performance data
                </div>
              ) : (
                <LineChart data={performanceData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={formatResponseTime}
                    tick={{ fontSize: 12 }}
                    label={{ value: "Response Time", angle: -90, position: "insideLeft" }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 12 }}
                    label={{ value: "Success Rate", angle: 90, position: "insideRight" }}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 14 }}
                    formatter={(value: any, name: string) =>
                      name === "responseTime" || name === "avgTime"
                        ? formatResponseTime(value)
                        : `${value}%`
                    }
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="responseTime"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="Response Time"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="successRate"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="Success Rate"
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-xl border border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900 text-lg">📊 Hourly Trends</CardTitle>
          <CardDescription>
            Success rate and latency averages by time of day.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              {successRateByHour.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  No hourly data
                </div>
              ) : (
                <BarChart
                  data={successRateByHour}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12 }} label={{ value: "Success Rate", angle: -90, position: "insideLeft" }} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={formatResponseTime}
                    tick={{ fontSize: 12 }}
                    label={{ value: "Avg Time", angle: 90, position: "insideRight" }}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 14 }}
                    formatter={(value: any, name: string) =>
                      name === "avgTime"
                        ? formatResponseTime(value)
                        : `${value}%`
                    }
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Bar yAxisId="left" dataKey="successRate" fill="#22c55e" name="Success Rate (%)" />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="avgTime"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    name="Avg Response Time"
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
