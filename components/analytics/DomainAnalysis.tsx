import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LucidePieChart } from "lucide-react";
import { useDomainAnalysis } from "@/app/logic/domainAnalysisLogic";
import type { RankingSnapshot } from "@/types/type";

interface DomainAnalysisProps {
  snapshots: RankingSnapshot[];
}

export function DomainAnalysis({ snapshots }: DomainAnalysisProps) {
  const domainStats = useDomainAnalysis(snapshots);
  const topDomains = domainStats.slice(0, 50); // show more domains, scroll will handle overflow

  return (
    <Card className="h-[500px] flex flex-col">
      <CardHeader>
        <CardTitle className="text-gray-900">Domain Analysis</CardTitle>
        <CardDescription>Domain authority tracking and ranking distribution</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        {topDomains.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <LucidePieChart className="w-16 h-16 text-gray-400 mb-4" />
            <p className="text-lg font-medium text-gray-600">No domain data available</p>
            <p className="text-sm text-gray-500 mt-1">
              Run queries and create snapshots to see domain-level insights.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-2 text-left">Domain</th>
                  <th className="px-4 py-2 text-left">Results</th>
                  <th className="px-4 py-2 text-left">Avg. Position</th>
                  <th className="px-4 py-2 text-left">Best</th>
                  <th className="px-4 py-2 text-left">Worst</th>
                  <th className="px-4 py-2 text-left">Content Types</th>
                </tr>
              </thead>
              <tbody>
                {topDomains.map((d, idx) => (
                  <tr
                    key={d.domain}
                    className={`border-b last:border-b-0 transition-colors hover:bg-gray-50 ${
                      idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                    }`}
                  >
                    {/* Domain cell with favicon */}
                    <td className="px-4 py-2 font-medium text-blue-700 whitespace-nowrap flex items-center gap-2">
                      <img
                        src={`https://www.google.com/s2/favicons?sz=32&domain=${d.domain}`}
                        alt=""
                        className="w-5 h-5"
                      />
                      <a
                        href={`https://${d.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {d.domain}
                      </a>
                    </td>

                    <td className="px-4 py-2">{d.count}</td>

                    {/* Avg Position with color-coded badge */}
                    <td className="px-4 py-2">
                      <Badge
                        variant="outline"
                        className={
                          d.avgPosition <= 3
                            ? "border-green-500 text-green-600"
                            : d.avgPosition <= 10
                            ? "border-yellow-500 text-yellow-600"
                            : "border-red-500 text-red-600"
                        }
                      >
                        {d.avgPosition.toFixed(2)}
                      </Badge>
                    </td>

                    {/* Best Position */}
                    <td className="px-4 py-2">
                      <Badge
                        variant="outline"
                        className={
                          d.bestPosition === 1
                            ? "border-green-500 text-green-600"
                            : "border-gray-400 text-gray-600"
                        }
                      >
                        {d.bestPosition}
                      </Badge>
                    </td>

                    {/* Worst Position */}
                    <td className="px-4 py-2">
                      <Badge
                        variant="outline"
                        className="border-gray-300 text-gray-500"
                      >
                        {d.worstPosition}
                      </Badge>
                    </td>

                    {/* Content Types */}
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(d.contentTypes).map(([type, count]) => (
                          <Badge key={type} variant="secondary" className="text-xs">
                            {type}: {count}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
