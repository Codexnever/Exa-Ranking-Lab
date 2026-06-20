// components/analytics/RankingTrendChart.tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip } from "recharts";
import { AlertTriangle, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TrendPoint } from "@/types/type";

// ─── Anomaly styling helpers ───────────────────────────────────────────────

function getAnomalyColor(type: string): string {
  switch (type) {
    case 'sudden_drop':      return '#ef4444'; // red
    case 'sudden_rise':      return '#f97316'; // orange
    case 'high_volatility':  return '#8b5cf6'; // purple
    case 'position_spike':   return '#eab308'; // yellow
    default:                 return '#ef4444';
  }
}

function getAnomalyMessage(type: string, score: number): string {
  switch (type) {
    case 'sudden_drop':
      return `Sudden ranking drop detected (${score.toFixed(1)}σ above normal volatility)`;
    case 'sudden_rise':
      return `Unexpected ranking improvement (${score.toFixed(1)}σ above normal volatility)`;
    case 'high_volatility':
      return `High ranking instability detected (${score.toFixed(1)}σ above average)`;
    case 'position_spike':
      return `Extreme position change (${score.toFixed(1)}σ deviation)`;
    default:
      return `Anomaly detected (${score.toFixed(1)}σ above threshold)`;
  }
}

/**
 *  FIX: custom dot renderer attached DIRECTLY to the visible avgPosition
 * Line via its `dot` prop, instead of rendering a second, invisible
 * <Line dataKey="avgPosition" stroke="transparent" .../> purely to host
 * anomaly markers. The old approach made Recharts compute and render the
 * SAME series path twice — wasted work that scales with dataset size.
 *
 *  FIX: defensive field access — payload.avgPosition?.toFixed(1) etc.
 * Previously this called .toFixed() directly on potentially-undefined
 * fields, which would throw and crash the ENTIRE chart's render (not just
 * fail to show one dot) if a single anomaly data point had a missing field.
 *
 *  FIX: replaced the per-dot Radix Tooltip (TooltipProvider + Tooltip +
 * TooltipTrigger + TooltipContent mounted separately for EVERY anomaly dot)
 * with native SVG <title> for hover text. Radix tooltips are heavy —
 * mounting one full portal/positioning instance per anomaly dot is real
 * overhead for charts with many anomalies, and wrapping an SVG <g> in
 * TooltipTrigger asChild is a fragile pattern (no guaranteed ref-forwarding
 * support for SVG group elements across Radix versions). The main chart
 * tooltip (RechartsTooltip + CustomTooltip below) already surfaces full
 * anomaly details on hover over the data point itself, so the dot's own
 * tooltip was largely redundant — <title> still gives a native browser
 * hover hint without the overhead or fragility.
 */
function AnomalyDot(props: any) {
  const { cx, cy, payload } = props;
  if (!payload?.isAnomaly) return null;

  const score = typeof payload.anomalyScore === "number" ? payload.anomalyScore : 0;
  const type  = payload.anomalyType ?? "unknown";
  const color = getAnomalyColor(type);
  const message = getAnomalyMessage(type, score);

  const avgPos     = typeof payload.avgPosition === "number" ? payload.avgPosition.toFixed(1) : "—";
  const volatility = typeof payload.volatility   === "number" ? payload.volatility.toFixed(2)  : "—";

  return (
    <g>
      <title>
        {`${message}\nDate: ${payload.date ?? "—"} | Position: ${avgPos} | Volatility: ${volatility}`}
      </title>
      {/* Pulsing circle background */}
      <circle
        cx={cx}
        cy={cy}
        r={8}
        fill={color}
        fillOpacity={0.2}
        className="animate-pulse"
      />
      {/* Alert triangle icon */}
      <foreignObject x={cx - 6} y={cy - 6} width={12} height={12}>
        <AlertTriangle width={12} height={12} color={color} className="drop-shadow-sm" />
      </foreignObject>
    </g>
  );
}

// ─── Main chart tooltip ─────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  // ✅ All fields read defensively — a single missing field on the active
  // tooltip's data point previously crashed the WHOLE chart's render
  // (this is render-time code, not just display logic — a thrown error
  // here unmounts the entire LineChart, not just the tooltip).
  const avgPosition       = typeof data.avgPosition       === "number" ? data.avgPosition.toFixed(1)       : "—";
  const volatility        = typeof data.volatility        === "number" ? data.volatility.toFixed(2)        : "—";
  const predictedPosition = typeof data.predictedPosition === "number" ? data.predictedPosition.toFixed(1) : "—";
  const count             = data.count ?? "—";

  return (
    <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
      <div className="font-medium text-gray-900 mb-2">{label}</div>
      <div className="space-y-1 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-blue-600">Avg Position:</span>
          <span className="font-medium">#{avgPosition}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-purple-600">Volatility:</span>
          <span className="font-medium">{volatility}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-green-600">Predicted:</span>
          <span className="font-medium">#{predictedPosition}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-600">Data Points:</span>
          <span className="font-medium">{count}</span>
        </div>
        {data.isAnomaly && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Anomaly Detected
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function RankingTrendChart({ data = [] }: { data?: TrendPoint[] }) {
  const anomalyCount = data.filter(point => point.isAnomaly).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Ranking Changes Over Time
            </CardTitle>
            <CardDescription>
              Position movements across all tracked queries with predictive analytics
            </CardDescription>
          </div>
          {anomalyCount > 0 && (
            <Badge
              variant="destructive"
              className="gap-1"
              title={`${anomalyCount} unusual ranking pattern${anomalyCount === 1 ? '' : 's'} detected in this time period`}
            >
              <AlertTriangle className="h-3 w-3" />
              {anomalyCount} Anomal{anomalyCount === 1 ? 'y' : 'ies'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          {data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickLine={{ stroke: '#d1d5db' }}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickLine={{ stroke: '#d1d5db' }}
                  label={{ value: 'Position', angle: -90, position: 'insideLeft' }}
                />
                <RechartsTooltip content={<CustomTooltip />} />

                {/* ✅ Average Position Line — now carries the anomaly dot
                    renderer directly via its own `dot` prop, replacing the
                    second invisible Line that previously duplicated this
                    series purely to attach AnomalyDot. */}
                <Line
                  type="monotone"
                  dataKey="avgPosition"
                  stroke="#2563eb"
                  strokeWidth={2}
                  name="Avg Position"
                  dot={<AnomalyDot />}
                  activeDot={{ r: 4, fill: '#2563eb' }}
                />

                {/* Volatility Line */}
                <Line
                  type="monotone"
                  dataKey="volatility"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  name="Volatility"
                  dot={false}
                  activeDot={{ r: 4, fill: '#7c3aed' }}
                />

                {/* Predicted Position Line */}
                <Line
                  type="monotone"
                  dataKey="predictedPosition"
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Predicted"
                  dot={false}
                  activeDot={{ r: 4, fill: '#22c55e' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-gray-500">
              <div className="text-center">
                <Activity className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <div className="text-lg font-medium mb-2">No ranking data available</div>
                <div className="text-sm">Start tracking queries to see trend analysis</div>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-blue-600"></div>
            <span>Average Position</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-purple-600"></div>
            <span>Volatility</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-green-600 border-dashed border-t-2 border-green-600"></div>
            <span>Predicted</span>
          </div>
          {anomalyCount > 0 && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3 h-3 text-red-500" />
              <span>Anomalies</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}