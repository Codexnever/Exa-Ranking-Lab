// components/analytics/QueryPerformanceStatsTable.tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"

interface QueryStat {
  queryId?:   string;
  id?:        string;
  name?:      string;
  lastPosition?: number;
  positions?: number[];
}

interface QueryPerformanceStatsTableProps {
  stats?: QueryStat[];
}

export function QueryPerformanceStatsTable({ stats = [] }: QueryPerformanceStatsTableProps) {
  // ✅ Array.isArray guard — `stats` previously had no default param and
  // no guard, so an undefined/null value passed during initial load
  // (before the parent's fetch resolves) would throw on `.length` and
  // crash the entire component. Same class of bug fixed across every
  // other chart/table component in this audit.
  const safeStats = Array.isArray(stats) ? stats : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-gray-900">Query Performance Stats</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Top queries ranked by average position (latest 5 snapshots)
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          {safeStats.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-10">No query stats available</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Query</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Last Avg Pos</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Recent Positions</th>
                </tr>
              </thead>

              <tbody className="bg-white divide-y divide-gray-100">
                {safeStats.map((stat, idx) => {
                  // ✅ Filter positions to valid finite numbers before
                  // formatting — a single malformed entry (null, NaN, a
                  // string from a bad API response) previously crashed
                  // the table's ENTIRE render via an unguarded .toFixed()
                  // call, not just that one cell.
                  const validPositions = Array.isArray(stat.positions)
                    ? stat.positions.filter((p): p is number => typeof p === "number" && isFinite(p))
                    : [];

                  return (
                    <tr
                      // ✅ Stable key — uses the query's actual identifier
                      // instead of array index. Using `idx` as key meant
                      // React could incorrectly reuse DOM nodes across
                      // re-renders if `stats` is ever re-sorted or
                      // re-fetched in a different order, causing stale
                      // content to briefly appear under the wrong row.
                      key={stat.queryId ?? stat.id ?? `row-${idx}`}
                      className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-800 max-w-xs break-words">
                        <span title={stat.name}>{stat.name || "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {typeof stat.lastPosition === "number" && isFinite(stat.lastPosition)
                          ? stat.lastPosition.toFixed(2)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis">
                        {validPositions.length > 0
                          ? validPositions.slice(-5).map(p => p.toFixed(2)).join(", ")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>
    </Card>
  )
}