import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export function QueryPerformanceStatsTable({ stats }: { stats: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-gray-900">Query Performance Stats</CardTitle>
        <CardDescription>Top queries by last average position</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          {stats.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-10">No query stats available</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Query</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Avg Position</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Positions (last 5)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stats.map((stat, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{stat.name}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{stat.lastPosition !== null ? stat.lastPosition.toFixed(2) : "-"}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{stat.positions.slice(-5).map((p: number) => p.toFixed(2)).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
