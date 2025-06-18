import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function QueryPerformanceStatsTable({ stats }: { stats: any[] }) {
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
          {stats.length === 0 ? (
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
                {stats.map((stat, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800 max-w-xs break-words text-balance">
                      <span title={stat.name}>{stat.name || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {stat.lastPosition != null ? stat.lastPosition.toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis">
                      {Array.isArray(stat.positions)
                        ? stat.positions.slice(-5).map((p: number) => p.toFixed(2)).join(", ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
