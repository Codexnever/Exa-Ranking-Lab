"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { LucidePieChart } from "lucide-react"
import { useDomainAnalysis } from "@/logic/domainAnalysisLogic"
import type { RankingSnapshot } from "@/lib/types"

interface DomainAnalysisProps {
  snapshots: RankingSnapshot[]
}

export function DomainAnalysis({ snapshots }: DomainAnalysisProps) {
  const domainStats = useDomainAnalysis(snapshots)
  const topDomains = domainStats.slice(0, 10)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-gray-900">Domain Analysis</CardTitle>
        <CardDescription>Domain authority tracking and ranking distribution</CardDescription>
      </CardHeader>
      <CardContent>
        {topDomains.length === 0 ? (
          <div className="h-96 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg">
            <div className="text-center">
              <LucidePieChart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-600">Domain Distribution</p>
              <p className="text-sm text-gray-500 mt-2">
                Analysis of domain authority, ranking patterns, and content diversity
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border rounded-lg">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left">Domain</th>
                  <th className="px-4 py-2 text-left"># Results</th>
                  <th className="px-4 py-2 text-left">Avg. Position</th>
                  <th className="px-4 py-2 text-left">Best</th>
                  <th className="px-4 py-2 text-left">Worst</th>
                  <th className="px-4 py-2 text-left">Content Types</th>
                </tr>
              </thead>
              <tbody>
                {topDomains.map((d) => (
                  <tr key={d.domain} className="border-b last:border-b-0">
                    <td className="px-4 py-2 font-medium text-blue-700 whitespace-nowrap">{d.domain}</td>
                    <td className="px-4 py-2">{d.count}</td>
                    <td className="px-4 py-2">{d.avgPosition.toFixed(2)}</td>
                    <td className="px-4 py-2">{d.bestPosition}</td>
                    <td className="px-4 py-2">{d.worstPosition}</td>
                    <td className="px-4 py-2">
                      {Object.entries(d.contentTypes).map(([type, count]) => (
                        <Badge key={type} className="mr-1 mb-1" variant="outline">
                          {type}: {count}
                        </Badge>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
