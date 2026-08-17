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
import { formatResponseTime } from "@/hooks/format-response-time";

interface PerformanceChartsProps {
  performanceData: any[];
  successRateByHour: any[];
}

export function PerformanceCharts({
  performanceData,
  successRateByHour,
}: PerformanceChartsProps) {
  // ✅ Computed once, used to gate rendering OUTSIDE ResponsiveContainer
  //    (see note below on why this matters).
  const hasPerformanceData   = Array.isArray(performanceData) && performanceData.length > 0;
  // ✅ FIX: added Array.isArray guard — was `successRateByHour.length === 0`
  //    with no null/undefined check. If successRateByHour is ever
  //    undefined (e.g. during initial load before the parent's fetch
  //    resolves), this threw "Cannot read property 'length' of undefined"
  //    and crashed the whole component.
  const hasHourlyData        = Array.isArray(successRateByHour) && successRateByHour.length > 0;

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
            {/* ✅ FIX: empty-state check moved OUTSIDE ResponsiveContainer.
                Recharts' ResponsiveContainer expects exactly one chart
                component as its child — it clones that child and injects
                computed width/height via its internal ResizeObserver logic,
                which assumes an SVG-rendering chart. Putting a plain <div>
                inside it (the old `condition ? <div/> : <LineChart/>`
                pattern) breaks that assumption: the empty-state div doesn't
                participate in the same layout/resize lifecycle a chart
                does, which causes inconsistent sizing and layout jank when
                toggling between empty and populated states. The fix is to
                decide which to render BEFORE entering ResponsiveContainer,
                so it only ever wraps a real chart. */}
            {!hasPerformanceData ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                No performance data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
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
                    // ✅ FIX: this chart's dataKeys are "responseTime" and
                    //    "successRate" only — "avgTime" never appears here
                    //    (that check was copy-pasted from the second
                    //    chart's tooltip and did nothing in this context).
                    //    Formatter now matches the actual keys used below.
                    formatter={(value: unknown, name: string | number | undefined) =>
                      name === "responseTime"
                        ? formatResponseTime(typeof value === "string" || typeof value === "number" ? value : undefined)
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
              </ResponsiveContainer>
            )}
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
            {/* ✅ Same fix — empty-state check outside ResponsiveContainer */}
            {!hasHourlyData ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                No hourly data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
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
                    formatter={(value: unknown, name: string | number | undefined) =>
                      name === "avgTime"
                        ? formatResponseTime(typeof value === "string" || typeof value === "number" ? value : undefined)
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
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
