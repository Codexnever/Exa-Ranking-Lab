// components/analytics/DomainAnalysis.tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LucidePieChart } from "lucide-react";
import { useDomainAnalysis } from "@/app/logic/domainAnalysisLogic";
import type { RankingSnapshot } from "@/types/type";

interface DomainAnalysisProps {
  snapshots: RankingSnapshot[];
}

// ✅ Safe numeric formatter — d.avgPosition.toFixed(2) was previously
// unguarded; a single malformed entry from useDomainAnalysis() would
// crash the ENTIRE table render, not just that row. Same crash class
// fixed across TopPerformingQueries, QueryPerformanceStatsTable, etc.
function safeFixed(value: unknown, digits: number): string {
  return typeof value === "number" && isFinite(value) ? value.toFixed(digits) : "—";
}

// ✅ Position badge tier — handles NaN explicitly instead of letting it
// silently fall through to the "bad" (red) branch. Previously, a
// computation error (e.g. divide-by-zero inside useDomainAnalysis)
// producing NaN would render as "this domain ranks badly" rather than
// indicating something went wrong with the data itself.
function getPositionTier(value: unknown): "good" | "ok" | "bad" | "unknown" {
  if (typeof value !== "number" || !isFinite(value)) return "unknown";
  if (value <= 3) return "good";
  if (value <= 10) return "ok";
  return "bad";
}

const TIER_CLASSES: Record<ReturnType<typeof getPositionTier>, string> = {
  good:    "border-green-500 text-green-600",
  ok:      "border-yellow-500 text-yellow-600",
  bad:     "border-red-500 text-red-600",
  unknown: "border-gray-300 text-gray-400",
};

// ✅ Strips any accidentally-embedded protocol before building URLs —
// defends against `d.domain` ever containing "https://" already (the
// hook's internals aren't visible from this component, so this is a
// cheap safety net rather than trusting its output blindly).
function cleanDomain(domain: string): string {
  return domain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function DomainAnalysis({ snapshots }: DomainAnalysisProps) {
  const domainStats = useDomainAnalysis(snapshots);
  // ✅ Array.isArray guard — defensive in case the hook ever returns a
  // non-array value during a transient/error state.
  const safeDomainStats = Array.isArray(domainStats) ? domainStats : [];
  const topDomains = safeDomainStats.slice(0, 50);

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
                {topDomains.map((d, idx) => {
                  const domain = cleanDomain(d.domain || "");
                  // ✅ encodeURIComponent — domain interpolated into both
                  // an external favicon image URL and an outbound href
                  // with no encoding previously; a malformed domain string
                  // could break either URL.
                  const safeDomainParam = encodeURIComponent(domain);
                  const tier = getPositionTier(d.avgPosition);

                  return (
                    <tr
                      key={domain || `row-${idx}`}
                      className={`border-b last:border-b-0 transition-colors hover:bg-gray-50 ${
                        idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                      }`}
                    >
                      <td className="px-4 py-2 font-medium text-blue-700 whitespace-nowrap flex items-center gap-2">
                        <img
                          src={`https://www.google.com/s2/favicons?sz=32&domain=${safeDomainParam}`}
                          alt=""
                          className="w-5 h-5"
                          // ✅ onError fallback — Google's favicon service
                          // being unreachable/rate-limited previously left
                          // a broken image icon in every row with no
                          // recovery; now it's hidden instead.
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        <a
                          href={`https://${domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {domain || "—"}
                        </a>
                      </td>

                      <td className="px-4 py-2">{typeof d.count === "number" ? d.count : 0}</td>

                      <td className="px-4 py-2">
                        <Badge variant="outline" className={TIER_CLASSES[tier]}>
                          {safeFixed(d.avgPosition, 2)}
                        </Badge>
                      </td>

                      <td className="px-4 py-2">
                        <Badge
                          variant="outline"
                          className={
                            d.bestPosition === 1
                              ? "border-green-500 text-green-600"
                              : "border-gray-400 text-gray-600"
                          }
                        >
                          {typeof d.bestPosition === "number" ? d.bestPosition : "—"}
                        </Badge>
                      </td>

                      <td className="px-4 py-2">
                        <Badge variant="outline" className="border-gray-300 text-gray-500">
                          {typeof d.worstPosition === "number" ? d.worstPosition : "—"}
                        </Badge>
                      </td>

                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {d.contentTypes && typeof d.contentTypes === "object"
                            ? Object.entries(d.contentTypes).map(([type, count]) => (
                                <Badge key={type} variant="secondary" className="text-xs">
                                  {type}: {count as number}
                                </Badge>
                              ))
                            : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}