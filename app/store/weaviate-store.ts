// Enhanced Weaviate Store with improved analytics integration - FIXED VERSION
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  ContentCoherenceResult,
  SemanticStabilityResult,
  StatisticalValidationResult,
  DataQualityResult,
  CachedAnalytics
} from '@/types/type';

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

  // Analytics-specific state
  vectorsAvailable: boolean | null;
  analyticsCache: Record<string, CachedAnalytics>;
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
    documents: Array<{ title: string, content: string, vector?: number[] }>,
    method?: 'umass' | 'cv' | 'npmi'
  ) => Promise<ContentCoherenceResult>;

  calculateSemanticStability: (
    queryId: string,
    timeSeriesData: Array<{ timestamp: number, content: string, vectors?: number[][] }>
  ) => Promise<SemanticStabilityResult>;
  

  validatePredictionAccuracy: (userId: string) => Promise<StatisticalValidationResult>;
  assessDataQuality: (userId: string) => Promise<DataQualityResult>;
  processAdvancedAnalytics: (userId: string, options: any) => Promise<void>;

  // Analytics integration methods
  getAnalyticsData: (userId: string, timeRange: string, queries: any[]) => Promise<any>;
  refreshAnalyticsCache: (userId: string) => Promise<void>;
  isAnalyticsDataStale: (maxAge?: number) => boolean;

  // Initialization method
  initializeWeaviateMode: (userId: string, timeRange?: string) => Promise<void>;

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
      analyticsCache: {},
      lastAnalyticsRefresh: null,

      // FIXED: Enhanced setDataSource with proper initialization
      setDataSource: (source) => {
        console.log(`[WeaviateStore] Switching data source to: ${source}`);
        set(state => {
          const newState: any = { dataSource: source };

          if (source === 'appwrite') {
            // Complete cleanup when switching to appwrite
            newState.semanticInsights = null;
            newState.enhancedMetrics = null;
            newState.isConnected = false;
            newState.connectionStatus = 'disconnected';
            newState.vectorsAvailable = false;
            newState.error = null;
            newState.analyticsCache = {};
            newState.isLoading = false;
          } else if (source === 'weaviate') {
            // Initialize weaviate mode properly
            newState.connectionStatus = 'disconnected'; // Start as disconnected
            newState.error = null;
            newState.isLoading = false;
            newState.isConnected = false;
          }

          return newState;
        });
      },

      // NEW: Initialize Weaviate mode with proper data fetching
      initializeWeaviateMode: async (userId: string, timeRange: string = '7d') => {
        const { dataSource } = get();

        if (dataSource !== 'weaviate') {
          console.log('[WeaviateStore] Not in Weaviate mode, skipping initialization');
          return;
        }

        console.log('[WeaviateStore] Initializing Weaviate mode...');

        try {
          // First try to get analytics data
          await get().getSemanticAnalytics(userId, timeRange);

          // If that succeeds and we don't have vectors, try syncing
          const { vectorsAvailable } = get();
          if (!vectorsAvailable) {
            console.log('[WeaviateStore] No vectors available, attempting sync...');
            try {
              await get().syncQueries(userId);
            } catch (syncError) {
              console.warn('[WeaviateStore] Sync failed during initialization:', syncError);
              // Don't throw - analytics might still work with existing data
            }
          }
        } catch (error) {
          console.error('[WeaviateStore] Weaviate initialization failed:', error);
          // Set error state but don't throw
          set({
            error: error instanceof Error ? error.message : 'Weaviate initialization failed',
            connectionStatus: 'error',
            isConnected: false
          });
        }
      },

      // FIXED: Enhanced getAnalyticsData with better error handling
      getAnalyticsData: async (userId: string, timeRange: string, queries: any[]) => {
        const { dataSource, analyticsCache } = get();

        const cacheKey = `${userId}-${timeRange}-${dataSource}`;

        console.log(`[WeaviateStore] getAnalyticsData called - dataSource: ${dataSource}`);

        const cachedItem = analyticsCache[cacheKey];

        // Use cache if not stale
        if (
          cachedItem &&
          Date.now() - cachedItem.timestamp < 5 * 60 * 1000
        ) {
          console.log('[WeaviateStore] Returning cached analytics data');

          return cachedItem.data;
        }

        if (dataSource === 'weaviate') {
          try {
            await get().getSemanticAnalytics(userId, timeRange);

            const {
              semanticInsights,
              enhancedMetrics,
              vectorsAvailable
            } = get();

            const analyticsData = {
              semanticInsights,
              enhancedMetrics,
              vectorsAvailable,
              hasSemanticData: semanticInsights !== null,
              isVectorEnhanced: vectorsAvailable === true,
              dataSource: 'weaviate'
            };

            // Save cache
            set((state) => ({
              analyticsCache: {
                ...state.analyticsCache,
                [cacheKey]: {
                  data: analyticsData,
                  timestamp: Date.now()
                }
              },
              lastAnalyticsRefresh: Date.now()
            }));

            return analyticsData;

          } catch (error) {
            console.error('[WeaviateStore] Failed to get Weaviate analytics:', error);

            return {
              hasSemanticData: false,
              isVectorEnhanced: false,
              dataSource: 'weaviate',
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        }

        return {
          hasSemanticData: false,
          isVectorEnhanced: false,
          dataSource: 'appwrite'
        };
      },

      // FIXED: Completely rewritten getSemanticAnalytics with better error handling
      getSemanticAnalytics: async (userId: string, timeRange: string) => {
        const { dataSource } = get();

        console.log(`[WeaviateStore] getSemanticAnalytics called - dataSource: ${dataSource}, userId: ${userId}, timeRange: ${timeRange}`);

        if (dataSource !== 'weaviate') {
          console.log('[WeaviateStore] Not in Weaviate mode, clearing state');

          set({
            semanticInsights: null,
            enhancedMetrics: null,
            isConnected: false,
            connectionStatus: 'disconnected',
            vectorsAvailable: false,
            error: null,
            isLoading: false
          });

          return null;
        }

        // Set loading state
        set({
          isLoading: true,
          error: null,
          connectionStatus: 'connecting'
        });

        const operationType = 'semantic-analytics';

        try {
          console.log(`[WeaviateStore] Making API call for semantic analytics`);

          const response = await fetch(
            `/api/weaviate/semantic-analytics?userId=${encodeURIComponent(userId)}&timeRange=${timeRange}`,
            {
              method: 'GET',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              }
            }
          );

          console.log(`[WeaviateStore] API response status: ${response.status}`);

          let result;
          try {
            result = await response.json();
            console.log(`[WeaviateStore] API response data:`, result);
          } catch (parseError) {
            console.error('[WeaviateStore] Failed to parse JSON response:', parseError);
            throw new Error('Invalid JSON response from server');
          }

          if (!response.ok) {
            const errorMessage = result?.error || `HTTP ${response.status}: ${response.statusText}`;
            throw new Error(errorMessage);
          }

          if (!result.success) {
            throw new Error(result.error || 'Failed to fetch semantic analytics');
          }

          // Process the response data
          const responseData = result.data || {};
          const rawSemanticInsights = responseData.semanticInsights || {};
          const rawEnhancedMetrics = responseData.enhancedMetrics || {};

          console.log("[WeaviateStore] Processing raw data - insights:", rawSemanticInsights);
          console.log("[WeaviateStore] Processing raw data - metrics:", rawEnhancedMetrics);

          // Process semantic insights with proper fallbacks
          const processedInsights: SemanticInsights = {
            contentAnomalies: Array.isArray(rawSemanticInsights.contentAnomalies)
              ? rawSemanticInsights.contentAnomalies
              : [],
            weaviateMetrics: {
              totalVectors: rawSemanticInsights.weaviateMetrics?.totalVectors || 0,
              embeddingDimensions: rawSemanticInsights.weaviateMetrics?.embeddingDimensions || 0,
              lastIndexed: rawSemanticInsights.weaviateMetrics?.lastIndexed || Date.now(),
              clusterCount: rawSemanticInsights.weaviateMetrics?.clusterCount || 0,
              ...rawSemanticInsights.weaviateMetrics
            },
            semanticClusters: Array.isArray(rawSemanticInsights.semanticClusters)
              ? rawSemanticInsights.semanticClusters
              : [],
            trendAnalysis: rawSemanticInsights.trendAnalysis || {
              growingTopics: [],
              decliningTopics: [],
              emergingPatterns: []
            }
          };

          // Process enhanced metrics with proper fallbacks
          const processedMetrics: EnhancedMetrics = {
            semanticStability: rawEnhancedMetrics.semanticStability || 0,
            contentCoherence: rawEnhancedMetrics.contentCoherence || 0,
            diversityIndex: rawEnhancedMetrics.diversityIndex || 0,
            anomalyCount: rawEnhancedMetrics.anomalyCount || 0,
            statisticalValidation: rawEnhancedMetrics.statisticalValidation || null,
            dataQuality: rawEnhancedMetrics.dataQuality || null
          };

          // Update state with successful data
          const totalVectors = processedInsights.weaviateMetrics?.totalVectors || 0;
          const hasValidData = totalVectors > 0 || processedInsights.contentAnomalies!.length > 0;

          set({
            semanticInsights: processedInsights,
            enhancedMetrics: processedMetrics,
            vectorsAvailable: totalVectors > 0,
            isLoading: false,
            error: null,
            isConnected: hasValidData,
            connectionStatus: hasValidData ? 'connected' : 'disconnected',
            lastSyncTime: Date.now(),
            lastAnalyticsRefresh: Date.now(),
            lastSuccessfulOperation: Date.now()
          });

          // Record successful operation
          get().recordOperation(operationType, true);

          console.log(`[WeaviateStore] Semantic analytics processed successfully`);
          console.log(`[WeaviateStore] Final state - Connected: ${hasValidData}, Vectors: ${totalVectors}`);

          return {
            semanticInsights: processedInsights,
            enhancedMetrics: processedMetrics,
            vectorsAvailable: totalVectors > 0
          };

        } catch (error) {
          console.error('[WeaviateStore] Semantic analytics fetch error:', error);

          // Record failed operation
          get().recordOperation(operationType, false);

          // Set error state
          set({
            semanticInsights: null,
            enhancedMetrics: null,
            vectorsAvailable: false,
            isLoading: false,
            isConnected: false,
            connectionStatus: 'error',
            error: error instanceof Error ? error.message : 'Unknown error occurred'
          });

          // Re-throw for component handling
          throw error;
        }
      },

      // FIXED: Enhanced recordOperation with better logging
      recordOperation: (type: string, success: boolean) => {
        const now = Date.now();

        set(state => {
          const newHistory = [
            { timestamp: now, success, type },
            ...state.operationHistory.slice(0, 9)
          ];

          // Update connection status based on operation results
          const { dataSource } = state;
          let newConnectionStatus = state.connectionStatus;
          let newIsConnected = state.isConnected;

          if (dataSource === 'weaviate') {
            // Only update connection if we're not in error state from API calls
            if (type === 'semantic-analytics' || type === 'queries-sync' || type === 'data-sync') {
              newIsConnected = success;
              newConnectionStatus = success ? 'connected' : 'error';
            }
          }

          return {
            operationHistory: newHistory,
            lastSuccessfulOperation: success ? now : state.lastSuccessfulOperation,
            isConnected: newIsConnected,
            connectionStatus: newConnectionStatus
          };
        });

        console.log(`[WeaviateStore] Operation recorded: ${type} - ${success ? 'SUCCESS' : 'FAILED'}`);
      },

      // FIXED: Enhanced getConnectionHealth with better logic
      getConnectionHealth: () => {
        const {
          operationHistory,
          lastSuccessfulOperation,
          vectorsAvailable,
          dataSource,
          connectionStatus,
          isConnected
        } = get();

        console.log('[WeaviateStore] getConnectionHealth called', {
          dataSource,
          connectionStatus,
          isConnected,
          vectorsAvailable,
          lastSuccessfulOperation,
          operationHistoryLength: operationHistory.length
        });

        // If not in weaviate mode, return disconnected
        if (dataSource !== 'weaviate') {
          return { isHealthy: false, quality: 'disconnected', successRate: 0 };
        }

        const now = Date.now();

        // If no successful operations yet
        if (!lastSuccessfulOperation) {
          return { isHealthy: false, quality: 'disconnected', successRate: 0 };
        }

        // Calculate success rate from recent operations (last 10 minutes)
        const recentOperations = operationHistory.filter(op => now - op.timestamp < 10 * 60 * 1000);
        const successRate = recentOperations.length > 0
          ? Math.round((recentOperations.filter(op => op.success).length / recentOperations.length) * 100)
          : 0;

        const timeSinceLastSuccess = now - lastSuccessfulOperation;

        let quality: string;
        let isHealthy: boolean;

        // Determine health based on multiple factors
        if (connectionStatus === 'connected' && vectorsAvailable && timeSinceLastSuccess < 2 * 60 * 1000 && successRate >= 80) {
          quality = 'excellent';
          isHealthy = true;
        } else if (connectionStatus === 'connected' && timeSinceLastSuccess < 5 * 60 * 1000 && successRate >= 60) {
          quality = 'good';
          isHealthy = true;
        } else if (connectionStatus === 'error' || timeSinceLastSuccess > 10 * 60 * 1000 || successRate < 40) {
          quality = 'poor';
          isHealthy = false;
        } else if (connectionStatus === 'connecting') {
          quality = 'connecting';
          isHealthy = false;
        } else {
          quality = 'disconnected';
          isHealthy = false;
        }

        const healthResult = { isHealthy, quality, successRate };
        console.log('[WeaviateStore] Connection health result:', healthResult);

        return healthResult;
      },

      // Enhanced syncQueries with better error handling and state management
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

          let result;
          try {
            result = await response.json();
          } catch (parseError) {
            throw new Error('Invalid response from sync endpoint');
          }

          if (!response.ok) {
            throw new Error(result?.error || `HTTP ${response.status}: ${response.statusText}`);
          }

          if (!result.success) {
            throw new Error(result.error || 'Sync operation failed');
          }

          const syncStats = {
            synced: result.synced || 0,
            errors: result.errors || 0,
            total: result.totalQueries || 0
          };

          // Update state with sync results
          set(state => ({
            isLoading: false,
            error: null,
            lastSyncTime: Date.now(),
            vectorsAvailable: syncStats.synced > 0,
            connectionStatus: syncStats.synced > 0 ? 'connected' : 'disconnected',
            isConnected: syncStats.synced > 0,
            lastSyncStats: {
              ...state.lastSyncStats,
              queries: syncStats
            }
          }));

          // Clear analytics cache after sync
          set({ analyticsCache: {} });

          // Record successful operation
          get().recordOperation(operationType, true);

          console.log(`[WeaviateStore] Queries sync completed:`, syncStats);

          return syncStats;

        } catch (error) {
          console.error('[WeaviateStore] Queries sync failed:', error);

          get().recordOperation(operationType, false);

          set({
            isLoading: false,
            connectionStatus: 'error',
            isConnected: false,
            error: error instanceof Error ? error.message : 'Queries sync failed'
          });

          throw error;
        }
      },

      // Enhanced syncData with better state management
      syncData: async (userId: string) => {
        set({ isLoading: true, error: null, connectionStatus: 'connecting' });

        const operationType = 'data-sync';

        try {
          console.log(`[WeaviateStore] Syncing data for user: ${userId}`);

          const response = await fetch(`/api/weaviate/sync?userId=${encodeURIComponent(userId)}`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
          });

          let result;
          try {
            result = await response.json();
          } catch (parseError) {
            throw new Error('Invalid response from sync endpoint');
          }

          if (!response.ok) {
            throw new Error(result?.error || `HTTP ${response.status}: ${response.statusText}`);
          }

          if (!result.success) {
            throw new Error(result.error || 'Data sync failed');
          }

          const syncedCount = result.synced || 0;

          set(state => ({
            isLoading: false,
            lastSyncTime: Date.now(),
            error: null,
            vectorsAvailable: syncedCount > 0,
            connectionStatus: syncedCount > 0 ? 'connected' : 'disconnected',
            isConnected: syncedCount > 0,
            analyticsCache: {}, // Clear cache after sync
            lastSyncStats: {
              ...state.lastSyncStats,
              data: {
                synced: syncedCount,
                errors: result.errors || 0,
                total: result.total || 0
              }
            }
          }));

          get().recordOperation(operationType, true);

          console.log(`[WeaviateStore] Data sync completed:`, result);

        } catch (error) {
          console.error('[WeaviateStore] Data sync error:', error);

          get().recordOperation(operationType, false);

          set({
            isLoading: false,
            connectionStatus: 'error',
            isConnected: false,
            error: error instanceof Error ? error.message : 'Data sync failed'
          });

          throw error;
        }
      },

      // Analytics utility methods
      refreshAnalyticsCache: async (userId: string) => {
        console.log('[WeaviateStore] Refreshing analytics cache');
        set({ analyticsCache: {}, lastAnalyticsRefresh: null });
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

        try {
          console.log(`[WeaviateStore] Calculating content coherence for query: ${queryId}`);

          const response = await fetch(`/api/weaviate/calculate-coherence`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documents, method, queryId })
          });

          if (!response.ok) {
            throw new Error(`Failed to calculate content coherence: ${response.status} ${response.statusText}`);
          }

          const result = await response.json();

          if (!result.success) {
            throw new Error(result.error || 'Content coherence calculation failed');
          }

          set(state => ({
            enhancedMetrics: {
              ...state.enhancedMetrics,
              contentCoherence: result.data
            },
            isLoading: false
          }));

          get().recordOperation(operationType, true);
          console.log(`[WeaviateStore] Content coherence calculated successfully`);

          return result.data;

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
            throw new Error(`Failed to calculate semantic stability: ${response.status} ${response.statusText}`);
          }

          const result = await response.json();

          if (!result.success) {
            throw new Error(result.error || 'Semantic stability calculation failed');
          }

          set(state => ({
            enhancedMetrics: {
              ...state.enhancedMetrics,
              semanticStability: result.data
            },
            isLoading: false
          }));

          get().recordOperation(operationType, true);
          console.log(`[WeaviateStore] Semantic stability calculated successfully`);

          return result.data;

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
            analyticsCache: {} // Clear cache after processing
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
          analyticsCache: {},
          lastAnalyticsRefresh: null,
          isLoading: false
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
      // FIXED: Add proper error handling for persist rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Ensure Map is properly initialized after rehydration
          state.analyticsCache = {};

          // Reset loading states after rehydration
          state.isLoading = false;

          // If we're in weaviate mode but not connected, set proper status
          if (state.dataSource === 'weaviate' && !state.isConnected) {
            state.connectionStatus = 'disconnected';
          }

          console.log('[WeaviateStore] State rehydrated:', {
            dataSource: state.dataSource,
            connectionStatus: state.connectionStatus,
            isConnected: state.isConnected
          });
        }
      }
    }
  )
);