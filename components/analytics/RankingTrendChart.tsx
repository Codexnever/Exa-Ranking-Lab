// components/analytics/RankingTrendChart.tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Dot } from "recharts";
import { AlertTriangle, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TrendPoint } from "@/lib/type";

// Custom dot component for anomaly indicators
const AnomalyDot = ({ cx, cy, payload }: any) => {
  if (!payload.isAnomaly) return null;
  
  const getAnomalyColor = (type: string) => {
    switch (type) {
      case 'sudden_drop': return '#ef4444'; // red
      case 'sudden_rise': return '#f97316'; // orange  
      case 'high_volatility': return '#8b5cf6'; // purple
      case 'position_spike': return '#eab308'; // yellow
      default: return '#ef4444';
    }
  };

  const getAnomalyMessage = (type: string, score: number) => {
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
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <g>
            {/* Pulsing circle background */}
            <circle
              cx={cx}
              cy={cy}
              r={8}
              fill={getAnomalyColor(payload.anomalyType)}
              fillOpacity={0.2}
              className="animate-pulse"
            />
            {/* Alert triangle icon */}
            <AlertTriangle
              x={cx - 6}
              y={cy - 6}
              width={12}
              height={12}
              fill={getAnomalyColor(payload.anomalyType)}
              className="drop-shadow-sm"
            />
          </g>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <div className="font-medium text-red-600">⚠️ Anomaly Detected</div>
            <div className="text-sm">{getAnomalyMessage(payload.anomalyType, payload.anomalyScore)}</div>
            <div className="text-xs text-gray-500">
              Date: {payload.date} | Position: {payload.avgPosition.toFixed(1)} | Volatility: {payload.volatility.toFixed(2)}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Custom tooltip for the chart
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  
  return (
    <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
      <div className="font-medium text-gray-900 mb-2">{label}</div>
      <div className="space-y-1 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-blue-600">Avg Position:</span>
          <span className="font-medium">#{data.avgPosition.toFixed(1)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-purple-600">Volatility:</span>
          <span className="font-medium">{data.volatility.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-green-600">Predicted:</span>
          <span className="font-medium">#{data.predictedPosition.toFixed(1)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-600">Data Points:</span>
          <span className="font-medium">{data.count}</span>
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
};

export function RankingTrendChart({ data }: { data: TrendPoint[] }) {
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {anomalyCount} Anomal{anomalyCount === 1 ? 'y' : 'ies'}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-sm">
                    {anomalyCount} unusual ranking pattern{anomalyCount === 1 ? '' : 's'} detected in this time period
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
                
                {/* Average Position Line */}
                <Line 
                  type="monotone" 
                  dataKey="avgPosition" 
                  stroke="#2563eb" 
                  strokeWidth={2} 
                  name="Avg Position"
                  dot={false}
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
                
                {/* Anomaly Dots */}
                <Line
                  type="monotone"
                  dataKey="avgPosition"
                  stroke="transparent"
                  dot={<AnomalyDot />}
                  activeDot={false}
                  name=""
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
