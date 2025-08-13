"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Brain,
  Zap,
  ArrowRight,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronUp
} from "lucide-react";

interface PredictiveInsight {
  queryId: string;
  queryName: string;
  currentPosition: number;
  predictedPosition: number;
  probability: number;
  trend: 'up' | 'down' | 'stable';
  timeframe: string;
  factors: string[];
  confidence: 'high' | 'medium' | 'low';
  anomalyRisk: 'low' | 'medium' | 'high';
  // ADDED: Enhanced metrics
  volatility: number;
  momentum: number;
  semanticBoost: number;
}

interface PredictiveRankingsWidgetProps {
  userId: string;
  queries: Array<{ id: string; name: string; category?: string }>;
  snapshots: Array<{
    queryId: string;
    results: Array<{ position: number; url: string; title?: string }>;
    timestamp: Date | string;
  }>;
  semanticAnalytics?: {
    enhancedMetrics?: {
      semanticStability?: number;
      contentCoherence?: number;
    };
    contentAnomalies?: Array<{ queryId: string; anomalyScore: number }> | { count: number };
  };
  enhancedMetrics?: {
    semanticStability?: number;
    contentCoherence?: number;
    diversityIndex?: number;
    anomalyCount?: number;
  };
  timeframe?: string;
  onViewDetails?: (queryId: string) => void;
}

export function PredictiveRankingsWidget({
  queries,
  snapshots,
  semanticAnalytics,
  enhancedMetrics,
  timeframe = "7d",
  onViewDetails
}: PredictiveRankingsWidgetProps) {
  
  const [selectedTimeframe, setSelectedTimeframe] = useState(timeframe);
  const [showAllPredictions, setShowAllPredictions] = useState(false);
  const [sortBy, setSortBy] = useState<'probability' | 'trend' | 'confidence'>('probability');
  
  const predictiveInsights = useMemo((): PredictiveInsight[] => {
    if (!queries?.length || !snapshots?.length) return [];

    // Enhanced semantic metrics
    const semanticStability = enhancedMetrics?.semanticStability || 
      semanticAnalytics?.enhancedMetrics?.semanticStability || 0;
    const contentCoherence = enhancedMetrics?.contentCoherence || 
      semanticAnalytics?.enhancedMetrics?.contentCoherence || 0;

    // Anomaly detection
    let anomalyCount = 0;
    const queryAnomalies = new Map<string, number>();
    
    if (Array.isArray(semanticAnalytics?.contentAnomalies)) {
      anomalyCount = semanticAnalytics.contentAnomalies.length;
      semanticAnalytics.contentAnomalies.forEach(anomaly => {
        queryAnomalies.set(anomaly.queryId, anomaly.anomalyScore);
      });
    } else if (semanticAnalytics?.contentAnomalies?.count) {
      anomalyCount = semanticAnalytics.contentAnomalies.count;
    }

    const insights = queries.slice(0, 12).map((query) => {
      const querySnapshots = snapshots.filter(s => s.queryId === query.id);
      if (querySnapshots.length === 0) return null;

      // Get all positions with timestamps
      const positionData = querySnapshots
        .flatMap(s => (s.results || []).map(r => ({
          position: r.position,
          timestamp: new Date(s.timestamp)
        })))
        .filter(p => p.position > 0)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      if (positionData.length === 0) return null;

      const positions = positionData.map(p => p.position);
      const currentPosition = Math.round(
        positions.slice(-Math.min(3, positions.length))
          .reduce((sum, p) => sum + p, 0) / Math.min(3, positions.length)
      );

      // Enhanced trend analysis
      const trendSlope = calculateTrendSlope(positions);
      const volatility = calculatePositionVariance(positions);
      const momentum = calculateMomentum(positions.slice(-5));
      
      // Prediction with enhanced factors
      const multiplier = getTimeframeMultiplier(selectedTimeframe);
      const basePrediction = currentPosition - (trendSlope * multiplier);
      
      // Apply momentum and semantic adjustments
      const momentumAdjustment = momentum * 0.5;
      const semanticAdjustment = (semanticStability / 100) * (contentCoherence / 100) * 2;
      
      const predictedPosition = Math.max(1, Math.round(
        basePrediction - momentumAdjustment + semanticAdjustment
      ));

      const trend = getTrendDirection(currentPosition - predictedPosition);

      // Enhanced probability calculation
      const baseProbability = calculateBaseProbability(querySnapshots.length, positions.length);
      const semanticBoost = (semanticStability / 100) * 15 + (contentCoherence / 100) * 10;
      const volatilityPenalty = Math.min(volatility * 2, 15);
      
      const finalProbability = Math.max(30, Math.min(95, Math.round(
        baseProbability + semanticBoost - volatilityPenalty
      )));

      const confidence = getConfidenceLevel(finalProbability, querySnapshots.length, volatility);

      // Enhanced factors
      const factors = generatePredictionFactors({
        snapshotCount: querySnapshots.length,
        currentPosition,
        trend,
        hasSemanticAnalytics: semanticStability > 0,
        positionVariance: volatility,
        momentum,
        semanticStability,
        contentCoherence
      });

      const queryAnomalyScore = queryAnomalies.get(query.id) || 0;
      const anomalyRisk = assessAnomalyRisk(volatility, queryAnomalyScore, anomalyCount);

      return {
        queryId: query.id,
        queryName: query.name,
        currentPosition,
        predictedPosition,
        probability: finalProbability,
        trend,
        timeframe: getTimeframeLabel(selectedTimeframe),
        factors: factors.slice(0, 4),
        confidence,
        anomalyRisk,
        volatility,
        momentum,
        semanticBoost: semanticBoost
      };
    }).filter(Boolean) as PredictiveInsight[];

    // Sort insights
    return insights.sort((a, b) => {
      switch (sortBy) {
        case 'probability':
          return b.probability - a.probability;
        case 'trend':
          const trendOrder = { 'up': 3, 'stable': 2, 'down': 1 };
          return trendOrder[b.trend] - trendOrder[a.trend];
        case 'confidence':
          const confOrder = { 'high': 3, 'medium': 2, 'low': 1 };
          return confOrder[b.confidence] - confOrder[a.confidence];
        default:
          return b.probability - a.probability;
      }
    });
  }, [queries, snapshots, semanticAnalytics, enhancedMetrics, selectedTimeframe, sortBy]);

  // Helper functions (enhanced versions)
  function calculateTrendSlope(positions: number[]): number {
    if (positions.length < 2) return 0;
    const n = positions.length;
    const sumX = positions.reduce((s, _, i) => s + i, 0);
    const sumY = positions.reduce((s, y) => s + y, 0);
    const sumXY = positions.reduce((s, y, i) => s + i * y, 0);
    const sumX2 = positions.reduce((s, _, i) => s + i * i, 0);
    const denominator = n * sumX2 - sumX * sumX;
    return denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  }

  function calculateMomentum(recentPositions: number[]): number {
    if (recentPositions.length < 2) return 0;
    const recent = recentPositions.slice(-3);
    const older = recentPositions.slice(-6, -3);
    if (recent.length === 0 || older.length === 0) return 0;
    
    const recentAvg = recent.reduce((sum, pos) => sum + pos, 0) / recent.length;
    const olderAvg = older.reduce((sum, pos) => sum + pos, 0) / older.length;
    
    return olderAvg - recentAvg; // Positive momentum = improving (lower positions)
  }

  function calculatePositionVariance(positions: number[]): number {
    if (positions.length < 2) return 0;
    const mean = positions.reduce((s, p) => s + p, 0) / positions.length;
    return Math.sqrt(positions.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / positions.length);
  }

  function getTimeframeMultiplier(tf: string): number {
    const multipliers = { '24h': 0.3, '7d': 1.5, '30d': 3, '90d': 5 };
    return multipliers[tf as keyof typeof multipliers] || 1.5;
  }

  function getTimeframeLabel(tf: string): string {
    const labels = { 
      '24h': 'Next 24 hours', 
      '7d': 'Next 7 days', 
      '30d': 'Next 30 days', 
      '90d': 'Next 90 days' 
    };
    return labels[tf as keyof typeof labels] || 'Next 7 days';
  }

  function getTrendDirection(change: number): 'up' | 'down' | 'stable' {
    if (change > 1.5) return 'up';
    if (change < -1.5) return 'down';
    return 'stable';
  }

  function calculateBaseProbability(snapshotCount: number, positionCount: number): number {
    const dataQuality = Math.min(snapshotCount * 2 + positionCount, 35);
    return Math.max(40, 55 + dataQuality);
  }

  function getConfidenceLevel(probability: number, snapshotCount: number, volatility: number): 'high' | 'medium' | 'low' {
    if (probability >= 75 && snapshotCount >= 10 && volatility < 5) return 'high';
    if (probability >= 60 && snapshotCount >= 5 && volatility < 10) return 'medium';
    return 'low';
  }

  function generatePredictionFactors(params: {
    snapshotCount: number;
    currentPosition: number;
    trend: string;
    hasSemanticAnalytics: boolean;
    positionVariance: number;
    momentum: number;
    semanticStability: number;
    contentCoherence: number;
  }): string[] {
    const factors: string[] = [];
    
    if (params.snapshotCount > 15) factors.push("Rich historical data");
    if (params.hasSemanticAnalytics) factors.push("AI semantic analysis active");
    if (params.semanticStability > 70) factors.push("High semantic stability");
    if (params.contentCoherence > 70) factors.push("Strong content coherence");
    if (params.momentum > 2) factors.push("Strong positive momentum");
    if (params.momentum < -2) factors.push("Negative momentum detected");
    if (params.trend === "up") factors.push("Upward trend identified");
    if (params.trend === "down") factors.push("Downward trend warning");
    if (params.currentPosition <= 3) factors.push("Top 3 position advantage");
    else if (params.currentPosition <= 10) factors.push("Top 10 position");
    if (params.positionVariance < 3) factors.push("Very stable rankings");
    if (params.positionVariance > 15) factors.push("High volatility risk");
    
    return factors.length ? factors : ["Standard prediction model"];
  }

  function assessAnomalyRisk(variance: number, queryAnomalyScore: number, totalAnomalies: number): 'low' | 'medium' | 'high' {
    if (variance > 20 || queryAnomalyScore > 3 || totalAnomalies > 10) return 'high';
    if (variance > 10 || queryAnomalyScore > 1.5 || totalAnomalies > 5) return 'medium';
    return 'low';
  }

  // UI helper functions
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-red-600" />;
      default: return <Target className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'up': return 'text-green-600 bg-green-50 border-green-200';
      case 'down': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'text-green-700 bg-green-100 border-green-200';
      case 'medium': return 'text-yellow-700 bg-yellow-100 border-yellow-200';
      default: return 'text-gray-700 bg-gray-100 border-gray-200';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'high': return 'text-red-600';
      case 'medium': return 'text-yellow-600';
      default: return 'text-green-600';
    }
  };

  const getPositionChangeText = (current: number, predicted: number) => {
    const change = current - predicted;
    if (change > 0) return `↑${change} positions`;
    if (change < 0) return `↓${Math.abs(change)} positions`;
    return 'No change expected';
  };

  // Display logic
  const displayedInsights = showAllPredictions ? predictiveInsights : predictiveInsights.slice(0, 6);
  const hasMorePredictions = predictiveInsights.length > 6;

  // Empty state
  if (!predictiveInsights.length) {
    return (
      <Card className="border-l-4 border-l-purple-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            AI Ranking Predictions
            <Badge variant="secondary" className="bg-purple-100 text-purple-700">
              <Sparkles className="h-3 w-3 mr-1" /> Beta
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Target className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-xl font-semibold">Insufficient Data</h3>
            <p className="text-gray-600 mb-4">Need more snapshots to generate AI-powered predictions</p>
            <p className="text-sm text-gray-500">Minimum 3 snapshots per query required</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-purple-500">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            AI Ranking Predictions
            <Badge variant="secondary" className="bg-purple-100 text-purple-700">
              <Zap className="h-3 w-3 mr-1" /> {predictiveInsights.length} predictions
            </Badge>
          </CardTitle>
          
          {/* Enhanced controls */}
          <div className="flex items-center gap-2">
            <Select value={selectedTimeframe} onValueChange={setSelectedTimeframe}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24 Hours</SelectItem>
                <SelectItem value="7d">7 Days</SelectItem>
                <SelectItem value="30d">30 Days</SelectItem>
                <SelectItem value="90d">90 Days</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="probability">Probability</SelectItem>
                <SelectItem value="trend">Trend</SelectItem>
                <SelectItem value="confidence">Confidence</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Predictions */}
        {displayedInsights.map((insight) => (
          <div key={insight.queryId} className="p-4 border rounded-lg hover:bg-gray-50 transition-all">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold mb-1 truncate">{insight.queryName}</h4>
                <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                  <div className="flex items-center gap-1">
                    <span>Current:</span>
                    <Badge variant="outline" className="text-xs">#{insight.currentPosition}</Badge>
                  </div>
                  <ArrowRight className="h-3 w-3 text-gray-400" />
                  <div className="flex items-center gap-1">
                    <span>Predicted:</span>
                    <Badge variant="outline" className="text-xs">#{insight.predictedPosition}</Badge>
                  </div>
                  {insight.volatility > 5 && (
                    <Badge variant="outline" className="text-xs text-orange-600">
                      High volatility ({insight.volatility.toFixed(1)})
                    </Badge>
                  )}
                </div>
              </div>
              <div className={`p-2 rounded-full border ${getTrendColor(insight.trend)}`}>
                {getTrendIcon(insight.trend)}
              </div>
            </div>

            {/* Probability with enhanced display */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">Confidence</span>
                  {insight.semanticBoost > 10 && (
                    <Badge variant="secondary" className="text-xs bg-purple-50 text-purple-600">
                      +{Math.round(insight.semanticBoost)}% AI boost
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{insight.probability}%</span>
                  <Badge className={`text-xs border ${getConfidenceColor(insight.confidence)}`}>
                    {insight.confidence}
                  </Badge>
                </div>
              </div>
              <Progress value={insight.probability} className="h-2" />
            </div>

            {/* Enhanced metrics row */}
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="font-medium">{getPositionChangeText(insight.currentPosition, insight.predictedPosition)}</span>
              <div className="flex items-center gap-3">
                {insight.momentum !== 0 && (
                  <span className={`text-xs ${insight.momentum > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    Momentum: {insight.momentum > 0 ? '+' : ''}{insight.momentum.toFixed(1)}
                  </span>
                )}
                {insight.anomalyRisk === 'high' && (
                  <div className="flex items-center gap-1">
                    <AlertTriangle className={`h-3 w-3 ${getRiskColor(insight.anomalyRisk)}`} />
                    <span className="text-xs text-red-600">Risk</span>
                  </div>
                )}
                <span className="text-xs text-gray-500">{insight.timeframe}</span>
              </div>
            </div>

            {/* Enhanced factors */}
            <div className="mt-3 flex flex-wrap gap-1">
              {insight.factors.map((factor, idx) => (
                <Badge 
                  key={idx} 
                  variant="secondary" 
                  className={`text-xs ${
                    factor.includes('AI') || factor.includes('semantic') ? 
                    'bg-purple-50 text-purple-700 border-purple-200' :
                    factor.includes('positive') || factor.includes('advantage') ?
                    'bg-green-50 text-green-700 border-green-200' :
                    factor.includes('warning') || factor.includes('risk') ?
                    'bg-red-50 text-red-700 border-red-200' :
                    'bg-blue-50 text-blue-700 border-blue-200'
                  }`}
                >
                  {factor}
                </Badge>
              ))}
            </div>
          </div>
        ))}

        {/* Show more/less toggle */}
        {hasMorePredictions && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowAllPredictions(!showAllPredictions)}
          >
            {showAllPredictions ? (
              <>
                <ChevronUp className="h-4 w-4 mr-2" />
                Show Less Predictions
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-2" />
                Show All {predictiveInsights.length} Predictions
              </>
            )}
          </Button>
        )}

        {/* Enhanced Summary */}
        <div className="mt-6 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">
                {predictiveInsights.filter(p => p.trend === 'up').length}
              </div>
              <div className="text-xs text-green-700">Improving</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">
                {Math.round(predictiveInsights.reduce((sum, p) => sum + p.probability, 0) / predictiveInsights.length)}%
              </div>
              <div className="text-xs text-purple-700">Avg Confidence</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-indigo-600">
                {predictiveInsights.filter(p => p.confidence === 'high').length}
              </div>
              <div className="text-xs text-indigo-700">High Confidence</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">
                {predictiveInsights.filter(p => p.anomalyRisk === 'high').length}
              </div>
              <div className="text-xs text-orange-700">High Risk</div>
            </div>
          </div>
        </div>

        {/* Action */}
        {onViewDetails && (
          <div className="pt-4 border-t">
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={() => onViewDetails(predictiveInsights[0]?.queryId)}
            >
              <Target className="h-4 w-4 mr-2" /> 
              View Detailed AI Analysis
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
