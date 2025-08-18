import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  ContentCoherenceResult,
  SemanticStabilityResult,
  StatisticalValidationResult,
  DataQualityResult 
} from '@/lib/type';
import { calculateUMassCoherence,calculateSemanticStability} from "@/lib/analytics-calculations";

interface SyncStats {
  queries?: { synced: number; errors: number; total: number };
  data?: { synced: number; errors: number; total: number };
}
interface EnhancedMetrics {
  semanticStability?: SemanticStabilityResult;
  contentCoherence?: ContentCoherenceResult;
  diversityIndex?: number;
  anomalyCount?: number;
  statisticalValidation?: StatisticalValidationResult;
  dataQuality?: DataQualityResult;
}

interface WeaviateState {
  dataSource: 'appwrite' | 'weaviate';
  isConnected: boolean;
  semanticInsights: any | null;
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
}

interface WeaviateActions {
  setDataSource: (source: 'appwrite' | 'weaviate') => void;
  getSemanticAnalytics: (userId: string, timeRange: string) => Promise<void>;
  clearSemanticData: () => void;
  syncData: (userId: string) => Promise<void>;
  syncQueries: (userId: string) => Promise<{ synced: number; errors: number; total: number }>;
  recordOperation: (type: string, success: boolean) => void;
  getConnectionHealth: () => { isHealthy: boolean; quality: string; successRate: number };
  getLastOperationStatus: () => { type: string; success: boolean; timestamp: number } | null;
  getRecentOperations: (count?: number) => Array<{ timestamp: number; success: boolean; type: string }>;
  isOperationInProgress: () => boolean;
  refreshSemanticData: (userId: string, timeRange: string) => Promise<void>;
  getOperationStats: () => any;

  // Enhanced calculation methods (delegating to utilities)
  calculateContentCoherence: (
    queryId: string, 
    documents: Array<{title: string, content: string}>,
    method?: 'umass' | 'cv' | 'npmi'
  ) => Promise<ContentCoherenceResult>;
  
  calculateSemanticStability: (
    queryId: string,
    timeSeriesData: Array<{timestamp: number, content: string}>
  ) => Promise<SemanticStabilityResult>;
  
  validatePredictionAccuracy: (userId: string) => Promise<StatisticalValidationResult>;
  assessDataQuality: (userId: string) => Promise<DataQualityResult>;
  processAdvancedAnalytics: (userId: string, options: any) => Promise<void>;
  
  subscribeToRealTimeMetrics: (userId: string) => void;
  unsubscribeFromRealTimeMetrics: () => void;
  
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

      setDataSource: (source) => {
        console.log(`[WeaviateStore] Switching data source to: ${source}`);
        set({ dataSource: source });
        
        if (source === 'appwrite') {
          set({ 
            semanticInsights: null, 
            enhancedMetrics: null, 
            isConnected: false,
            connectionStatus: 'disconnected'
          });
        }
      },

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

      getConnectionHealth: () => {
        const { operationHistory, lastSuccessfulOperation } = get();
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

        if (timeSinceLastSuccess < 2 * 60 * 1000 && successRate > 80) {
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

      getLastOperationStatus: () => {
        const { operationHistory } = get();
        return operationHistory.length > 0 ? operationHistory[0] : null;
      },

      getRecentOperations: (count = 5) => {
        const { operationHistory } = get();
        return operationHistory.slice(0, count);
      },

      isOperationInProgress: () => {
        const { isLoading } = get();
        return isLoading;
      },

      // ENHANCED CALCULATION METHODS (using utilities)
      calculateContentCoherence: async (queryId, documents, method = 'umass') => {
        const operationType = 'content-coherence';
        set({ isLoading: true, error: null });
        
        try {
          console.log(`[WeaviateStore] Calculating content coherence for query: ${queryId}`);
          
          // Use utility function for calculation
          const result = calculateUMassCoherence(documents, method);
          
          // Update store
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
          
          // Use utility function for calculation
          const result = calculateSemanticStability(timeSeriesData);
          
          // Update store
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
          
          set({ isLoading: false });
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

      subscribeToRealTimeMetrics: (userId) => {
        console.log(`[WeaviateStore] Subscribing to real-time metrics for user: ${userId}`);
        set({
          realTimeMetrics: {
            subscribed: true,
            lastUpdate: Date.now(),
            userId
          }
        });
      },

      unsubscribeFromRealTimeMetrics: () => {
        console.log('[WeaviateStore] Unsubscribing from real-time metrics');
        set({
          realTimeMetrics: null
        });
      },

      // Existing methods remain the same...
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

          set(state => ({
            isLoading: false,
            error: null,
            lastSyncTime: Date.now(),
            lastSyncStats: {
              ...state.lastSyncStats,
              queries: {
                synced: result.synced || 0,
                errors: result.errors || 0,
                total: result.totalQueries || 0
              }
            }
          }));

          console.log(`[WeaviateStore] Queries sync completed:`, result);
          
          return {
            synced: result.synced || 0,
            errors: result.errors || 0,
            total: result.totalQueries || 0
          };

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

      getSemanticAnalytics: async (userId: string, timeRange: string) => {
        const { dataSource } = get();
        
        if (dataSource !== 'weaviate') {
          console.log('[WeaviateStore] Not in Weaviate mode, skipping semantic analytics');
          return;
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
              headers: {
                'Content-Type': 'application/json',
              }
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

          set({
            semanticInsights: result.data?.semanticInsights || null,
            enhancedMetrics: result.data?.enhancedMetrics || null,
            isLoading: false,
            error: null,
            lastSyncTime: Date.now()
          });

          const responseTime = Date.now() - startTime;
          console.log(`[WeaviateStore] Semantic analytics fetched successfully in ${responseTime}ms`);

        } catch (error) {
          console.error('[WeaviateStore] Semantic analytics fetch error:', error);
          
          get().recordOperation(operationType, false);

          set({
            semanticInsights: null,
            enhancedMetrics: null,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });

          throw error;
        }
      },

      syncData: async (userId: string) => {
        set({ isLoading: true, error: null, connectionStatus: 'connecting' });
        
        const operationType = 'data-sync';
        const startTime = Date.now();
        
        try {
          console.log(`[WeaviateStore] Syncing data for user: ${userId}`);
          
          const response = await fetch(`/api/weaviate/sync?userId=${encodeURIComponent(userId)}`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            }
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
          lastSyncStats: null
        });
      },

      refreshSemanticData: async (userId: string, timeRange: string) => {
        console.log('[WeaviateStore] Force refreshing semantic data');
        
        set({
          semanticInsights: null,
          enhancedMetrics: null,
          error: null
        });
        
        await get().getSemanticAnalytics(userId, timeRange);
      },

      getOperationStats: () => {
        const { operationHistory } = get();
        
        if (operationHistory.length === 0) {
          return {
            total: 0,
            successful: 0,
            failed: 0,
            successRate: 0,
            lastHour: { total: 0, successful: 0, failed: 0 }
          };
        }

        const now = Date.now();
        const lastHour = operationHistory.filter(op => now - op.timestamp < 60 * 60 * 1000);
        
        const successful = operationHistory.filter(op => op.success).length;
        const lastHourSuccessful = lastHour.filter(op => op.success).length;

        return {
          total: operationHistory.length,
          successful,
          failed: operationHistory.length - successful,
          successRate: Math.round((successful / operationHistory.length) * 100),
          lastHour: {
            total: lastHour.length,
            successful: lastHourSuccessful,
            failed: lastHour.length - lastHourSuccessful
          }
        };
      }
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
        lastValidation: state.lastValidation
      }),
    }
  )
);
