// components/analytics/AnalyticsAPIs.tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Target, BarChart3, Globe, Clock } from "lucide-react";
import { formatResponseTime } from "@/hooks/format-response-time";

interface HourlyStat {
  avgTime?: number;
}

interface AnalyticsAPIsProps {
  // Kept loose since this receives both Traditional (Appwrite) and
  // AI (Weaviate) mode analytics objects, which have different shapes —
  // see field derivation notes below for how each is handled safely.
  analytics: {
    rankingStability?: number;
    volatilityIndex?: number;
    domainDiversity?: number;
    avgResponseTime?: number;
    successRateByHour?: HourlyStat[];
  } | null | undefined;
}

/**
 * ✅ FIX: derive avgResponseTime SAFELY instead of reading a field that
 * never actually exists on the analytics object.
 *
 * Root cause: this component read `analytics?.avgResponseTime` directly,
 * but neither analyticsLogic.ts (Traditional mode) nor
 * WeaviateAnalyticsService.ts (AI mode) ever write a top-level
 * `avgResponseTime` field onto the analytics object. The only place this
 * value is computed is analytics-page.tsx's LOCAL `performanceSummary`
 * useMemo, which derives it from `successRateByHour[].avgTime` and never
 * writes it back onto the shared `analytics` object — so this component,
 * which receives the raw `analytics` object directly, was always reading
 * `undefined` and showing a broken/zero response time.
 *
 * This was the actual source of the "Avg Response Time not showing" bug
 * reported earlier — a DIFFERENT component than the one already fixed in
 * analytics-page.tsx. Same underlying data, two separate places it needed
 * to be computed correctly.
 */
function deriveAvgResponseTime(analytics: AnalyticsAPIsProps["analytics"]): number {
  // Prefer a direct field if some future analytics source ever provides one
  if (typeof analytics?.avgResponseTime === "number") {
    return analytics.avgResponseTime;
  }

  // Otherwise compute from successRateByHour — the field that's actually
  // populated by both analyticsCalculations() (Traditional) and
  // WeaviateAnalyticsService.getAnalytics() (AI mode, via the same
  // analyticsCalculations() call on Weaviate-exported snapshots).
  const hours = analytics?.successRateByHour;
  if (!Array.isArray(hours) || hours.length === 0) return 0;

  const validHours = hours.filter(
    (h): h is { avgTime: number } => typeof h?.avgTime === "number" && h.avgTime > 0
  );
  if (validHours.length === 0) return 0;

  return validHours.reduce((sum, h) => sum + h.avgTime, 0) / validHours.length;
}

export function AnalyticsAPIs({ analytics }: AnalyticsAPIsProps) {
  const avgResponseTime = deriveAvgResponseTime(analytics);

  // Defensive numeric coercion — analytics is shared across two modes
  // (Traditional/Appwrite and AI/Weaviate) whose underlying services were
  // built separately; guarding against any shape drift here is cheap
  // insurance against a future .toFixed() crash if one mode's output
  // shape changes.
  const rankingStability = typeof analytics?.rankingStability === "number"
    ? analytics.rankingStability : 0;
  const volatilityIndex = typeof analytics?.volatilityIndex === "number"
    ? analytics.volatilityIndex : 0;
  const domainDiversity = typeof analytics?.domainDiversity === "number"
    ? analytics.domainDiversity : 0;

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
            <Target className="w-4 h-4" />
            Ranking Stability Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900">{rankingStability.toFixed(1)}%</div>
          <div className="flex items-center gap-2 mt-2">
            <Progress value={rankingStability} className="flex-1" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Volatility Index
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900">{volatilityIndex.toFixed(1)}</div>
          <p className="text-xs text-gray-500 mt-1">Lower is better</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Domain Diversity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900">{domainDiversity.toFixed(1)}</div>
          {/* FIX: label corrected to match what's actually computed.
              Per WeaviateAnalyticsService.computeDomainDiversity(), this
              value is a Shannon-entropy-based score normalised to 0-100,
              NOT a raw count of unique domains. The old description
              ("Unique domains tracked") described a different metric
              than what's shown — a user reading "23" under that label
              would reasonably assume 23 distinct domains, not an entropy
              score. */}
          <p className="text-xs text-gray-500 mt-1">Domain distribution evenness (0–100)</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Avg Response Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900">{formatResponseTime(avgResponseTime)}</div>
          <p className="text-xs text-gray-500 mt-1">API response time</p>
        </CardContent>
      </Card>
    </div>
  );
}