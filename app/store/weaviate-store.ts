// Enhanced Weaviate Store with improved analytics integration
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  ContentCoherenceResult,
  SemanticStabilityResult,
  StatisticalValidationResult,
  DataQualityResult 
} from '@/lib/type';
import { 
  calculateUMassCoherence,
  calculateSemanticStability,
  calculateDiversityIndex,
  detectAnomalies
} from "@/lib/analytics-calculations";

interface SyncStats {
  queries?: { synced: number; errors: number; total: number };
  data?: { synced: number; errors: number; total: number };
}

interface EnhancedMetrics {
  semanticStability?: SemanticStabilityResult | number;
  contentCoherence?: ContentCoherenceResult | number;
  diversityIndex?: number;
  anomalyCount?: number;
  statisticalValidation?: StatisticalValidationResult;
  dataQuality?: DataQualityResult;
}

interface WeaviateMetrics {
  totalVectors?: number;
  embeddingDimensions?: number;
  lastIndexed?: number;
  clusterCount?: number;
}

interface SemanticInsights {
  contentAnomalies?: Array<{
    type: string;
    queryId: string;
    url: string;
    title: string;
    description?: string;
    anomalyScore: number;
    timestamp: string;
  }>;
  weaviateMetrics?: WeaviateMetrics;
  semanticClusters?: Array<{
    id: string;
    queries: string[];
    centroid: number[];
    coherenceScore: number;
  }>;
  trendAnalysis?: {
    growingTopics: string[];
    decliningTopics: string[];
    emergingPatterns: string[];
  };
}

interface WeaviateState {
  dataSource: 'appwrite' | 'weaviate';
  isConnected: boolean;
  semanticInsights: SemanticInsights | null;
  enhancedMetrics: EnhancedMetrics | null;
  isLoading: boolean;
  error: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastSyncTime: number | null;
  lastSuccessfulOperation: number | null;
  operationHistory: Array<{ timestamp: number; success: boolean; type: string }>;
  lastSyncStats: SyncStats | null;
  realTimeMetrics: any | null;
  modelAccuracy: number | null;
  lastValidation: number | null;
  
  // New analytics-specific state
  vectorsAvailable: boolean;
  analyticsCache: Map<string, any>;
  lastAnalyticsRefresh: number | null;
}

interface WeaviateActions {
  setDataSource: (source: 'appwrite' | 'weaviate') => void;
  getSemanticAnalytics: (userId: string, timeRange: string) => Promise<any>;
  clearSemanticData: () => void;
  syncData: (userId: string) => Promise<void>;
  syncQueries: (userId: string) => Promise<{ synced: number; errors: number; total: number }>;
  recordOperation: (type: string, success: boolean) => void;
  getConnectionHealth: () => { isHealthy: boolean; quality: string; successRate: number };
  
  // Enhanced calculation methods
  calculateContentCoherence: (
    queryId: string, 
    documents: Array<{title: string, content: string, vector?: number[]}>,
    method?: 'umass' | 'cv' | 'npmi'
  ) => Promise<ContentCoherenceResult>;
  
  calculateSemanticStability: (
    queryId: string,
    timeSeriesData: Array<{timestamp: number, content: string, vectors?: number[][]}>
  ) => Promise<SemanticStabilityResult>;
  
  validatePredictionAccuracy: (userId: string) => Promise<StatisticalValidationResult>;
  assessDataQuality: (userId: string) => Promise<DataQualityResult>;
  processAdvancedAnalytics: (userId: string, options: any) => Promise<void>;
  
  // Analytics integration methods
  getAnalyticsData: (userId: string, timeRange: string, queries: any[]) => Promise<any>;
  refreshAnalyticsCache: (userId: string) => Promise<void>;
  isAnalyticsDataStale: (maxAge?: number) => boolean;
  
  // Utility methods
  getSyncStatus: () => {
    isInProgress: boolean;
    lastSyncTime: number | null;
    lastSyncStats: SyncStats | null;
    canSync: boolean;
  };
}

type WeaviateStore = WeaviateState & WeaviateActions;

export const useWeaviateStore = create<WeaviateStore>()(
  persist(
    (set, get) => ({
      // State
      dataSource: 'appwrite',
      isConnected: false,
      semanticInsights: null,
      enhancedMetrics: null,
      isLoading: false,
      error: null,
      connectionStatus: 'disconnected',
      lastSyncTime: null,
      lastSuccessfulOperation: null,
      operationHistory: [],
      lastSyncStats: null,
      realTimeMetrics: null,
      modelAccuracy: null,
      lastValidation: null,
      vectorsAvailable: false,
      analyticsCache: new Map(),
      lastAnalyticsRefresh: null,

      // Enhanced setDataSource with proper cleanup
      setDataSource: (source) => {
        console.log(`[WeaviateStore] Switching data source to: ${source}`);
        
        set(state => {
          const newState: any = { dataSource: source };
          
          if (source === 'appwrite') {
            newState.semanticInsights = null;
            newState.enhancedMetrics = null;
            newState.isConnected = false;
            newState.connectionStatus = 'disconnected';
            newState.vectorsAvailable = false;
          } else if (source === 'weaviate') {
            // Maintain connection status if switching to Weaviate
            newState.connectionStatus = 'connecting';
          }
          
          return newState;
        });
      },

      // Enhanced getAnalyticsData for better integration
      getAnalyticsData: async (userId: string, timeRange: string, queries: any[]) => {
        const { dataSource, analyticsCache } = get();
        const cacheKey = `${userId}-${timeRange}-${dataSource}`;
        
        // Check cache first
        if (analyticsCache.has(cacheKey) && !get().isAnalyticsDataStale()) {
          console.log('[WeaviateStore] Returning cached analytics data');
          return analyticsCache.get(cacheKey);
        }
        
        if (dataSource === 'weaviate') {
          try {
            await get().getSemanticAnalytics(userId, timeRange);
            const { semanticInsights, enhancedMetrics } = get();
            
            const analyticsData = {
              semanticInsights,
              enhancedMetrics,
              vectorsAvailable: get().vectorsAvailable,
              hasSemanticData: true,
              isVectorEnhanced: true,
              dataSource: 'weaviate'
            };
            
            // Cache the result
            set(state => {
              const newCache = new Map(state.analyticsCache);
              newCache.set(cacheKey, analyticsData);
              return { 
                analyticsCache: newCache,
                lastAnalyticsRefresh: Date.now()
              };
            });
            
            return analyticsData;
          } catch (error) {
            console.error('[WeaviateStore] Failed to get Weaviate analytics:', error);
            throw error;
          }
        }
        
        // For Appwrite, return indicator that no semantic data is available
        return {
          hasSemanticData: false,
          isVectorEnhanced: false,
          dataSource: 'appwrite'
        };
      },

      // Enhanced getSemanticAnalytics with better error handling
      getSemanticAnalytics: async (userId: string, timeRange: string) => {
        const { dataSource } = get();
        
        if (dataSource !== 'weaviate') {
          console.log('[WeaviateStore] Not in Weaviate mode, skipping semantic analytics');
          return null;
        }

        set({ isLoading: true, error: null, connectionStatus: 'connecting' });

        const operationType = 'semantic-analytics';
        const startTime = Date.now();

        try {
          console.log(`[WeaviateStore] Fetching semantic analytics for user: ${userId}, timeRange: ${timeRange}`);
          
          const response = await fetch(
            `/api/weaviate/semantic-analytics?userId=${encodeURIComponent(userId)}&timeRange=${timeRange}`,
            { 
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' }
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const result = await response.json();

          if (!result.success) {
            throw new Error(result.error || 'Failed to fetch semantic analytics');
          }

          get().recordOperation(operationType, true);

          // Enhanced data processing
          const semanticInsights = result.data?.semanticInsights || {};
          const enhancedMetrics = result.data?.enhancedMetrics || {};
          
          // Ensure proper structure for UI components
          const processedInsights: SemanticInsights = {
            contentAnomalies: Array.isArray(semanticInsights.contentAnomalies) 
              ? semanticInsights.contentAnomalies 
              : [],
            weaviateMetrics: {
              totalVectors: semanticInsights.weaviateMetrics?.totalVectors || 0,
              embeddingDimensions: semanticInsights.weaviateMetrics?.embeddingDimensions || 0,
              lastIndexed: semanticInsights.weaviateMetrics?.lastIndexed || Date.now(),
              clusterCount: semanticInsights.weaviateMetrics?.clusterCount || 0,
              ...semanticInsights.weaviateMetrics
            },
            semanticClusters: semanticInsights.semanticClusters || [],
            trendAnalysis: semanticInsights.trendAnalysis || {
              growingTopics: [],
              decliningTopics: [],
              emergingPatterns: []
            }
          };

          // Process enhanced metrics with proper typing
          const processedMetrics: EnhancedMetrics = {
            semanticStability: enhancedMetrics.semanticStability || 0,
            contentCoherence: enhancedMetrics.contentCoherence || 0,
            diversityIndex: enhancedMetrics.diversityIndex || 0,
            anomalyCount: enhancedMetrics.anomalyCount || 0,
            statisticalValidation: enhancedMetrics.statisticalValidation,
            dataQuality: enhancedMetrics.dataQuality
          };

          set({
            semanticInsights: processedInsights,
            enhancedMetrics: processedMetrics,
            vectorsAvailable: (processedInsights.weaviateMetrics?.totalVectors || 0) > 0,
            isLoading: false,
            error: null,
            lastSyncTime: Date.now(),
            lastAnalyticsRefresh: Date.now()
          });

          const responseTime = Date.now() - startTime;
          console.log(`[WeaviateStore] Semantic analytics fetched successfully in ${responseTime}ms`);

          return {
            semanticInsights: processedInsights,
            enhancedMetrics: processedMetrics,
            vectorsAvailable: (processedInsights.weaviateMetrics?.totalVectors || 0) > 0
          };

        } catch (error) {
          console.error('[WeaviateStore] Semantic analytics fetch error:', error);
          
          get().recordOperation(operationType, false);

          set({
            semanticInsights: null,
            enhancedMetrics: null,
            vectorsAvailable: false,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });

          throw error;
        }
      },

      // Enhanced recordOperation with connection status updates
      recordOperation: (type: string, success: boolean) => {
        const now = Date.now();
        
        set(state => ({
          operationHistory: [
            { timestamp: now, success, type },
            ...state.operationHistory.slice(0, 9)
          ],
          lastSuccessfulOperation: success ? now : state.lastSuccessfulOperation,
          isConnected: success,
          connectionStatus: success ? 'connected' : 'error'
        }));

        console.log(`[WeaviateStore] Operation recorded: ${type} - ${success ? 'SUCCESS' : 'FAILED'}`);
      },

      // Enhanced connection health with more detailed status
      getConnectionHealth: () => {
        const { operationHistory, lastSuccessfulOperation, vectorsAvailable } = get();
        const now = Date.now();
        
        if (!lastSuccessfulOperation) {
          return { isHealthy: false, quality: 'disconnected', successRate: 0 };
        }
        
        const timeSinceLastSuccess = now - lastSuccessfulOperation;
        const recentOperations = operationHistory.filter(op => now - op.timestamp < 5 * 60 * 1000);
        
        const successRate = recentOperations.length > 0 
          ? Math.round((recentOperations.filter(op => op.success).length / recentOperations.length) * 100)
          : 0;

        let quality: string;
        let isHealthy: boolean;

        if (timeSinceLastSuccess < 2 * 60 * 1000 && successRate > 80 && vectorsAvailable) {
          quality = 'excellent';
          isHealthy = true;
        } else if (timeSinceLastSuccess < 5 * 60 * 1000 && successRate > 60) {
          quality = 'good';
          isHealthy = true;
        } else if (timeSinceLastSuccess < 10 * 60 * 1000) {
          quality = 'poor';
          isHealthy = false;
        } else {
          quality = 'disconnected';
          isHealthy = false;
        }

        return { isHealthy, quality, successRate };
      },

      // Enhanced syncQueries with better error handling
      syncQueries: async (userId: string) => {
        const operationType = 'queries-sync';
        set({ isLoading: true, error: null, connectionStatus: 'connecting' });
        
        try {
          console.log(`[WeaviateStore] Syncing queries for user: ${userId}`);
          
          const response = await fetch('/api/weaviate/sync-queries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ userId })
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to sync queries with Weaviate');
          }

          const result = await response.json();
          
          if (!result.success) {
            throw new Error(result.error || 'Sync operation failed');
          }

          get().recordOperation(operationType, true);

          const syncStats = {
            synced: result.synced || 0,
            errors: result.errors || 0,
            total: result.totalQueries || 0
          };

          set(state => ({
            isLoading: false,
            error: null,
            lastSyncTime: Date.now(),
            vectorsAvailable: syncStats.synced > 0,
            lastSyncStats: {
              ...state.lastSyncStats,
              queries: syncStats
            }
          }));

          // Clear analytics cache after sync
          set({ analyticsCache: new Map() });

          console.log(`[WeaviateStore] Queries sync completed:`, syncStats);
          
          return syncStats;

        } catch (error) {
          console.error('[WeaviateStore] Queries sync failed:', error);
          
          get().recordOperation(operationType, false);

          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Queries sync failed'
          });

          throw error;
        }
      },

      // Enhanced syncData with analytics cache invalidation
      syncData: async (userId: string) => {
        set({ isLoading: true, error: null, connectionStatus: 'connecting' });
        
        const operationType = 'data-sync';
        const startTime = Date.now();
        
        try {
          console.log(`[WeaviateStore] Syncing data for user: ${userId}`);
          
          const response = await fetch(`/api/weaviate/sync?userId=${encodeURIComponent(userId)}`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (!response.ok) {
            throw new Error(`Failed to sync data to Weaviate: ${response.status} ${response.statusText}`);
          }
          
          const result = await response.json();
          
          get().recordOperation(operationType, true);
          
          set(state => ({
            isLoading: false,
            lastSyncTime: Date.now(),
            error: null,
            vectorsAvailable: (result.synced || 0) > 0,
            analyticsCache: new Map(), // Clear cache after sync
            lastSyncStats: {
              ...state.lastSyncStats,
              data: {
                synced: result.synced || 0,
                errors: result.errors || 0,
                total: result.total || 0
              }
            }
          }));
          
          const responseTime = Date.now() - startTime;
          console.log(`[WeaviateStore] Data sync completed in ${responseTime}ms:`, result);

        } catch (error) {
          console.error('[WeaviateStore] Data sync error:', error);
          
          get().recordOperation(operationType, false);

          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Sync failed'
          });

          throw error;
        }
      },

      // Analytics utility methods
      refreshAnalyticsCache: async (userId: string) => {
        console.log('[WeaviateStore] Refreshing analytics cache');
        set({ analyticsCache: new Map() });
      },

      isAnalyticsDataStale: (maxAge: number = 5 * 60 * 1000) => {
        const { lastAnalyticsRefresh } = get();
        if (!lastAnalyticsRefresh) return true;
        return Date.now() - lastAnalyticsRefresh > maxAge;
      },

      // Enhanced calculation methods with proper integration
      calculateContentCoherence: async (queryId, documents, method = 'umass') => {
        const operationType = 'content-coherence';
        set({ isLoading: true, error: null });
        console.log(`[WeaviateStore] Starting content coherence calculation for query: ${queryId}`);
        try {
          console.log(`[WeaviateStore] Calculating content coherence for query: ${queryId}`);

          const response = await fetch(`/api/weaviate/calculate-coherence`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documents, method, queryId })
          });

          if (!response.ok) {
            throw new Error(`Failed to calculateContentCoherence data to Weaviate: ${response.status} ${response.statusText}`);
          }

          const result = await response.json();

          if (!response.ok) {
            throw new Error(`Failed to sync data to Weaviate: ${response.status} ${response.statusText}`);
          }          
          set(state => ({
            enhancedMetrics: {
              ...state.enhancedMetrics,
              contentCoherence: result
            },
            isLoading: false
          }));
          
          get().recordOperation(operationType, true);
          console.log(`[WeaviateStore] Content coherence calculated: ${result.overallCoherence.toFixed(1)}%`);
          
          return result;
          
        } catch (error) {
          console.error('[WeaviateStore] Content coherence calculation failed:', error);
          get().recordOperation(operationType, false);
          
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Content coherence calculation failed'
          });
          
          throw error;
        }
      },

      calculateSemanticStability: async (queryId, timeSeriesData) => {
        const operationType = 'semantic-stability';
        set({ isLoading: true, error: null });
        
        try {
          console.log(`[WeaviateStore] Calculating semantic stability for query: ${queryId}`);
          
  const response = await fetch(`/api/weaviate/semantic-stability`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queryId, timeSeriesData })
          });

          if (!response.ok) {
            throw new Error(`Failed to calculateSemanticStability data to Weaviate: ${response.status} ${response.statusText}`);
          }

          const result = await response.json();

          if (!response.ok) {
            throw new Error(`Failed to sync data to Weaviate: ${response.status} ${response.statusText}`);
          }                    
          set(state => ({
            enhancedMetrics: {
              ...state.enhancedMetrics,
              semanticStability: result
            },
            isLoading: false
          }));
          
          get().recordOperation(operationType, true);
          console.log(`[WeaviateStore] Semantic stability calculated: ${result.stabilityScore.toFixed(1)}%`);
          
          return result;
          
        } catch (error) {
          console.error('[WeaviateStore] Semantic stability calculation failed:', error);
          get().recordOperation(operationType, false);
          
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Semantic stability calculation failed'
          });
          
          throw error;
        }
      },

      validatePredictionAccuracy: async (userId) => {
        const operationType = 'prediction-validation';
        set({ isLoading: true, error: null });
        
        try {
          console.log(`[WeaviateStore] Validating prediction accuracy for user: ${userId}`);
          
          const response = await fetch('/api/weaviate/validate-predictions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ userId })
          });
          
          if (!response.ok) {
            throw new Error(`Validation failed: ${response.status} ${response.statusText}`);
          }
          
          const result = await response.json();
          
          if (!result.success) {
            throw new Error(result.error || 'Prediction validation failed');
          }
          
          const validation: StatisticalValidationResult = {
            accuracy: result.accuracy,
            precision: result.precision,
            recall: result.recall,
            f1Score: result.f1Score,
            mape: result.mape,
            confidenceLevel: 95,
            lastValidated: Date.now()
          };
          
          set(state => ({
            enhancedMetrics: {
              ...state.enhancedMetrics,
              statisticalValidation: validation
            },
            modelAccuracy: result.accuracy,
            lastValidation: Date.now(),
            isLoading: false
          }));
          
          get().recordOperation(operationType, true);
          console.log(`[WeaviateStore] Prediction validation completed: ${result.accuracy.toFixed(1)}% accuracy`);
          
          return validation;
          
        } catch (error) {
          console.error('[WeaviateStore] Prediction validation failed:', error);
          get().recordOperation(operationType, false);
          
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Prediction validation failed'
          });
          
          throw error;
        }
      },

      assessDataQuality: async (userId) => {
        const operationType = 'data-quality-assessment';
        set({ isLoading: true, error: null });
        
        try {
          console.log(`[WeaviateStore] Assessing data quality for user: ${userId}`);
          
          const response = await fetch(`/api/weaviate/data-quality?userId=${encodeURIComponent(userId)}`, {
            credentials: 'include'
          });
          
          if (!response.ok) {
            throw new Error(`Data quality assessment failed: ${response.status} ${response.statusText}`);
          }
          
          const result = await response.json();
          
          if (!result.success) {
            throw new Error(result.error || 'Data quality assessment failed');
          }
          
          const dataQuality: DataQualityResult = {
            completeness: result.completeness,
            accuracy: result.accuracy,
            consistency: result.consistency,
            freshness: result.freshness,
            validity: result.validity,
            anomalyCount: result.anomalyCount,
            assessedAt: Date.now()
          };
          
          set(state => ({
            enhancedMetrics: {
              ...state.enhancedMetrics,
              dataQuality
            },
            isLoading: false
          }));
          
          get().recordOperation(operationType, true);
          console.log(`[WeaviateStore] Data quality assessment completed`);
          
          return dataQuality;
          
        } catch (error) {
          console.error('[WeaviateStore] Data quality assessment failed:', error);
          get().recordOperation(operationType, false);
          
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Data quality assessment failed'
          });
          
          throw error;
        }
      },

      processAdvancedAnalytics: async (userId, options = {}) => {
        const operationType = 'advanced-analytics';
        set({ isLoading: true, error: null });
        
        try {
          console.log(`[WeaviateStore] Processing advanced analytics for user: ${userId}`);
          
          const promises = [];
          
          if (options.includeContentCoherence) {
            promises.push(get().calculateContentCoherence(userId, options.documents || []));
          }
          
          if (options.includeSemanticStability) {
            promises.push(get().calculateSemanticStability(userId, options.timeSeriesData || []));
          }
          
          if (options.validatePredictions) {
            promises.push(get().validatePredictionAccuracy(userId));
          }
          
          if (options.assessDataQuality) {
            promises.push(get().assessDataQuality(userId));
          }
          
          await Promise.allSettled(promises);
          
          set({ 
            isLoading: false,
            analyticsCache: new Map() // Clear cache after processing
          });
          get().recordOperation(operationType, true);
          
          console.log(`[WeaviateStore] Advanced analytics processing completed`);
          
        } catch (error) {
          console.error('[WeaviateStore] Advanced analytics processing failed:', error);
          get().recordOperation(operationType, false);
          
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Advanced analytics processing failed'
          });
          
          throw error;
        }
      },

      getSyncStatus: () => {
        const { isLoading, lastSyncTime, lastSyncStats, connectionStatus } = get();
        
        return {
          isInProgress: isLoading,
          lastSyncTime,
          lastSyncStats,
          canSync: connectionStatus !== 'connecting' && !isLoading
        };
      },

      clearSemanticData: () => {
        console.log('[WeaviateStore] Clearing semantic data');
        
        set({
          semanticInsights: null,
          enhancedMetrics: null,
          isConnected: false,
          connectionStatus: 'disconnected',
          error: null,
          lastSyncTime: null,
          lastSuccessfulOperation: null,
          operationHistory: [],
          lastSyncStats: null,
          vectorsAvailable: false,
          analyticsCache: new Map(),
          lastAnalyticsRefresh: null
        });
      },
    }),
    {
      name: 'weaviate-storage',
      partialize: (state) => ({
        dataSource: state.dataSource,
        lastSyncTime: state.lastSyncTime,
        lastSuccessfulOperation: state.lastSuccessfulOperation,
        operationHistory: state.operationHistory.slice(0, 5),
        lastSyncStats: state.lastSyncStats,
        modelAccuracy: state.modelAccuracy,
        lastValidation: state.lastValidation,
        vectorsAvailable: state.vectorsAvailable,
        lastAnalyticsRefresh: state.lastAnalyticsRefresh
      }),
    }
  )
);