import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";

export function TopPerformingQueries({ items }: { items: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-gray-900">Top Performing Queries</CardTitle>
        <CardDescription>Queries with the most stable and high-quality rankings</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-lg border border-gray-100">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{item.name}</p>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-xs text-gray-500">Avg position: #{item.avgPosition.toFixed(1)}</span>
                  <span className="text-xs text-gray-500">Stability: {item.stability.toFixed(1)}%</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={item.trend === "up" ? "default" : item.trend === "down" ? "destructive" : "secondary"}
                >
                  {item.trend === "up" && <TrendingUp className="w-3 h-3 mr-1" />}
                  {item.trend === "down" && <TrendingDown className="w-3 h-3 mr-1" />}
                  {item.trend}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
