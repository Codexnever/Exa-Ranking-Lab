import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";

export function RankingTrendChart({ data }: { data: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-gray-900">Ranking Changes Over Time</CardTitle>
        <CardDescription>Position movements across all tracked queries</CardDescription>
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
