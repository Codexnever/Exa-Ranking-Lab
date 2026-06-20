// components/analytics/TopPerformingQueries.tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TopPerformingQuery {
  queryId?:          string;
  id?:               string;
  name?:             string;
  avgPosition?:      number;
  stability?:        number;
  predictedPosition?: number;
  trendSlope?:       number;
  trend?:            "up" | "down" | "stable";
  isAnomaly?:        boolean;
}

interface TopPerformingQueriesProps {
  items?: TopPerformingQuery[];
}

// ✅ Safe numeric formatter — every numeric field in this list previously
// called .toFixed() directly with no guard. If ANY single item was
// missing ANY of these 4 fields, the throw aborted the ENTIRE .map()
// render — not just that one row, every row in the list disappeared.
// This was the highest-risk unguarded-render pattern found across this
// whole audit (4 separate unguarded calls in one component, vs 1-2
// elsewhere).
function safeFixed(value: unknown, digits: number): string {
  return typeof value === "number" && isFinite(value) ? value.toFixed(digits) : "—";
}

function trendLabel(trend: string | undefined): string {
  switch (trend) {
    case "up":   return "Improving";
    case "down": return "Declining";
    default:     return "Stable";
  }
}

export function TopPerformingQueries({ items = [] }: TopPerformingQueriesProps) {
  // ✅ Array.isArray guard — default param only covers explicit
  // undefined; explicit null bypasses it and crashes on .length.
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-gray-900">Top Performing Queries</CardTitle>
        <CardDescription>Queries with the most stable and high-quality rankings (with predictions)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {safeItems.length === 0 ? (
            <p className="text-center text-gray-500">No top queries available.</p>
          ) : (
            safeItems.map((item, i) => (
              <div
                // ✅ Stable key — uses the query's actual identifier
                // instead of array index, same fix applied to
                // QueryPerformanceStatsTable for the same reason
                // (re-sorted/re-fetched data could otherwise cause React
                // to reuse DOM nodes incorrectly across re-renders).
                key={item.queryId ?? item.id ?? `query-${i}`}
                className="flex items-center gap-4 p-3 rounded-lg border border-gray-100"
              >
                <div className="flex-1">
                  {/* ✅ Fallback for missing name — was previously a
                      silent blank row with no indication why */}
                  <p className="text-sm font-medium text-gray-900">
                    {item.name || "Unknown Query"}
                  </p>
                  <div className="flex items-center gap-4 mt-1 flex-wrap">
                    {/* ✅ All four numeric fields now formatted safely —
                        a missing field shows "—" for that one stat
                        instead of crashing every row in the list */}
                    <span className="text-xs text-gray-500">
                      Avg position: #{safeFixed(item.avgPosition, 1)}
                    </span>
                    <span className="text-xs text-gray-500">
                      Stability: {safeFixed(item.stability, 1)}%
                    </span>
                    <span className="text-xs text-gray-500">
                      Predicted: #{safeFixed(item.predictedPosition, 1)}
                    </span>
                    <span className="text-xs text-gray-500">
                      Slope: {safeFixed(item.trendSlope, 2)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={item.trend === "up" ? "default" : item.trend === "down" ? "destructive" : "secondary"}
                  >
                    {item.trend === "up" && <TrendingUp className="w-3 h-3 mr-1" />}
                    {item.trend === "down" && <TrendingDown className="w-3 h-3 mr-1" />}
                    {item.trend === "stable" && <Minus className="w-3 h-3 mr-1" />}
                    {/* ✅ Friendly label instead of raw "up"/"down"/"stable"
                        string — matches the trend vocabulary used in
                        SERPJourneyFlow ("Improving"/"Declining"/"Stable") */}
                    {trendLabel(item.trend)}
                  </Badge>
                  {item.isAnomaly && <Badge variant="destructive">Anomaly</Badge>}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}