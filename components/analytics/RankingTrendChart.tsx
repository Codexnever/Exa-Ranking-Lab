// components/analytics/RankingTrendChart.tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import { AlertTriangle } from "lucide-react";

export function RankingTrendChart({ data }: { data: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-gray-900">Ranking Changes Over Time</CardTitle>
        <CardDescription>Position movements across all tracked queries (with predictions and anomalies)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          {data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="avgPosition" stroke="#2563eb" strokeWidth={2} name="Avg Position" />
                <Line type="monotone" dataKey="volatility" stroke="#7c3aed" strokeWidth={2} name="Volatility" />
                <Line type="monotone" dataKey="predictedPosition" stroke="#22c55e" strokeDasharray="5 5" name="Predicted" /> {/* New: Predicted line */}
                {data.map((point, index) => point.isAnomaly && ( /* New: Anomaly flag */
                  <ReferenceLine key={index} x={point.date} stroke="red" label={<AlertTriangle size={16} color="red" />} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-96 items-center justify-center text-gray-500">
              No ranking data available yet.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
