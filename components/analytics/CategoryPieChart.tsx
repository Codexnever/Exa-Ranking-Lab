// components/analytics/CategoryPieChart.tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";

interface CategoryDatum {
  name:   string;
  value:  number;
  color?: string;
}

interface CategoryPieChartProps {
  data?: CategoryDatum[];
}

// ✅ Fallback palette — used when an entry doesn't provide its own
// `color`. Previously <Cell fill={entry.color}> with a missing color
// rendered as fill={undefined}, which SVG silently resolves to black —
// a confusing visual bug with no error or indication of the cause.
const FALLBACK_COLORS = [
  "#3b82f6", "#8b5cf6", "#22c55e", "#f97316",
  "#ef4444", "#06b6d4", "#eab308", "#ec4899",
];

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="bg-white p-2 border border-gray-200 rounded-lg shadow-lg text-sm">
      <span className="font-medium" style={{ color: entry.payload.color || entry.color }}>
        {entry.name}
      </span>
      : <span className="font-medium">{entry.value}</span>
    </div>
  );
}

export function CategoryPieChart({ data = [] }: CategoryPieChartProps) {
  // ✅ Array.isArray guard — default param only covers explicit
  // `undefined`; a caller passing `data={null}` would bypass it and
  // crash on .filter()/.map() below without this check.
  const safeData = Array.isArray(data) ? data : [];

  // ✅ Filter out non-positive values and assign fallback colors —
  // a zero/negative `value` produces a malformed or invisible slice,
  // and a missing `color` previously rendered as black with no warning.
  const chartData = safeData
    .filter(d => typeof d?.value === "number" && d.value > 0)
    .map((d, i) => ({
      ...d,
      color: d.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    }));

  const hasData = chartData.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-gray-900">Query Category Distribution</CardTitle>
        <CardDescription>Breakdown of queries by category</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          {/* ✅ Empty-state check OUTSIDE ResponsiveContainer — same fix
              applied to PerformanceCharts/RankingBarChart. Rendering a
              PieChart with zero slices shows a blank circle with no
              indication of why; ResponsiveContainer also expects exactly
              one chart-SVG child for its layout logic. */}
          {!hasData ? (
            <div className="flex h-full items-center justify-center text-gray-500">
              <div className="text-center">
                <PieChartIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <div className="text-lg font-medium mb-2">No category data available</div>
                <div className="text-sm">Run queries to see category distribution</div>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value) => <span className="text-xs text-gray-700">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
