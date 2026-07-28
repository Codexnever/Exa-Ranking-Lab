// components/analytics/RankingBarChart.tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from "recharts";
import { BarChart3 } from "lucide-react";
import type { TrendPoint } from "@/types/type";

interface RankingBarChartProps {
  data?: TrendPoint[];
}

// Custom tooltip — human-readable label instead of raw dataKey "avgPosition"
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  return (
    <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
      <div className="font-medium text-gray-900 mb-1">{label}</div>
      <div className="text-sm text-blue-600">
        Avg Position: <span className="font-medium">#{typeof value === "number" ? value.toFixed(1) : "—"}</span>
      </div>
    </div>
  );
}

export function RankingBarChart({ data = [] }: RankingBarChartProps) {
  // ✅ Array.isArray guard — data could be undefined during initial load
  //    before the parent's fetch resolves; passing that directly to
  //    BarChart is fragile (same class of bug fixed in PerformanceCharts.tsx)
  const hasData = Array.isArray(data) && data.length > 0;

  // ✅ Y-axis domain bounds — position is 1 = best, higher = worse.
  //    Used below with `reversed` to make taller bars represent BETTER
  //    rankings, matching the "lower number = better" semantics used
  //    everywhere else in the codebase (drift analyzer, SERPJourneyFlow
  //    trend direction, etc). Without this, the default Recharts axis
  //    (low values near the bottom) makes a GOOD position (#1, a short
  //    bar) look worse on the chart than a BAD position (#50, a tall
  //    bar) — directly inverting how the data should read.
  const maxPosition = hasData
    ? Math.max(...data.map(d => d.avgPosition ?? 1), 10)
    : 10;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-gray-900">Ranking Analysis</CardTitle>
        <CardDescription>Detailed ranking performance and position tracking</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-96">
          {/* ✅ Empty-state check moved OUTSIDE ResponsiveContainer — same
              fix applied to PerformanceCharts.tsx. ResponsiveContainer
              expects exactly one chart-SVG child; rendering a plain
              empty-state div inside it breaks its resize/layout
              assumptions and causes inconsistent sizing. */}
          {!hasData ? (
            <div className="flex h-full items-center justify-center text-gray-500">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <div className="text-lg font-medium mb-2">No ranking data available</div>
                <div className="text-sm">Start tracking queries to see position analysis</div>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickLine={{ stroke: '#d1d5db' }}
                />
                {/* ✅ reversed + explicit domain — position #1 (best) now
                    renders at the TOP of the axis with a tall bar;
                    position #50 (worst) renders near the bottom with a
                    short bar. This matches the intuitive "taller = better"
                    reading and the "lower number = better" semantics used
                    throughout the rest of the app. */}
                <YAxis
                  reversed
                  domain={[1, maxPosition]}
                  tick={{ fontSize: 12 }}
                  tickLine={{ stroke: '#d1d5db' }}
                  label={{ value: 'Position', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="avgPosition" fill="#2563eb" name="Avg Position" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}