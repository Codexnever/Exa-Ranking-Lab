import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Target, BarChart3, Globe, Clock } from "lucide-react";

export function AnalyticsAPIs({ analytics }: { analytics: any }) {
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
          <div className="text-2xl font-bold text-gray-900">{analytics?.rankingStability?.toFixed(1) ?? 0}%</div>
          <div className="flex items-center gap-2 mt-2">
            <Progress value={analytics?.rankingStability || 0} className="flex-1" />
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
          <div className="text-2xl font-bold text-gray-900">{analytics?.volatilityIndex?.toFixed(1) ?? 0}</div>
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
          <div className="text-2xl font-bold text-gray-900">{analytics?.domainDiversity ?? 0}</div>
          <p className="text-xs text-gray-500 mt-1">Unique domains tracked</p>
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
          <div className="text-2xl font-bold text-gray-900">{analytics?.avgResponseTime?.toFixed(1) ?? 0}s</div>
          <p className="text-xs text-gray-500 mt-1">API response time</p>
        </CardContent>
      </Card>
    </div>
  );
}
