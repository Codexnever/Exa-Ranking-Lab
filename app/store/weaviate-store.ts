// app/store/weaviate-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WeaviateState {
  dataSource: 'appwrite' | 'weaviate';
  isConnected: boolean;
  semanticInsights: any | null;
  enhancedMetrics: any | null;
  isLoading: boolean;
  error: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastSyncTime: number | null;
}

interface WeaviateActions {
  setDataSource: (source: 'appwrite' | 'weaviate') => void;
  getSemanticAnalytics: (userId: string, timeRange: string) => Promise<void>;
  clearSemanticData: () => void;
  checkConnection: () => Promise<boolean>;
  syncData: (userId: string) => Promise<void>;
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

      setDataSource: (source) => {
        console.log(`[WeaviateStore] Switching data source to: ${source}`);
        set({ dataSource: source });
        
        // Clear semantic data when switching back to Appwrite
        if (source === 'appwrite') {
          set({ 
            semanticInsights: null, 
            enhancedMetrics: null, 
            isConnected: false,
            connectionStatus: 'disconnected'
          });
        } else if (source === 'weaviate') {
          // Check connection when switching to Weaviate
          get().checkConnection();
        }
      },

      checkConnection: async () => {
        set({ connectionStatus: 'connecting' });
        
        try {
          const response = await fetch('/api/weaviate/health');
          const isHealthy = response.ok;
          
          set({
            isConnected: isHealthy,
            connectionStatus: isHealthy ? 'connected' : 'error',
            error: isHealthy ? null : 'Weaviate connection failed'
          });
          
          return isHealthy;
        } catch (error) {
          set({
            isConnected: false,
            connectionStatus: 'error',
            error: error instanceof Error ? error.message : 'Connection check failed'
          });
          return false;
        }
      },

      getSemanticAnalytics: async (userId: string, timeRange: string) => {
        const { dataSource } = get();
        
        // Only fetch semantic analytics if in Weaviate mode
        if (dataSource !== 'weaviate') return;

        set({ isLoading: true, error: null });

        try {
          const response = await fetch(
            `/api/weaviate/semantic-analytics?userId=${encodeURIComponent(userId)}&timeRange=${timeRange}`,
            { credentials: 'include' }
          );

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const result = await response.json();

          if (!result.success) {
            throw new Error(result.error || 'Failed to fetch semantic analytics');
          }

          set({
            semanticInsights: result.data?.semanticInsights || null,
            enhancedMetrics: result.data?.enhancedMetrics || null,
            isConnected: true,
            connectionStatus: 'connected',
            isLoading: false,
            error: null,
            lastSyncTime: Date.now()
          });

          console.log('[WeaviateStore] Semantic analytics fetched successfully');

        } catch (error) {
          console.error('Weaviate analytics fetch error:', error);
          set({
            semanticInsights: null,
            enhancedMetrics: null,
            isConnected: false,
            connectionStatus: 'error',
            isLoading: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },

      syncData: async (userId: string) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await fetch(`/api/weaviate/sync?userId=${encodeURIComponent(userId)}`, {
            method: 'POST',
            credentials: 'include'
          });
          
          if (!response.ok) {
            throw new Error('Failed to sync data to Weaviate');
          }
          
          const result = await response.json();
          
          set({
            isLoading: false,
            lastSyncTime: Date.now(),
            error: null
          });
          
          console.log('[WeaviateStore] Data sync completed:', result);
          
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Sync failed'
          });
        }
      },

      clearSemanticData: () => {
        set({
          semanticInsights: null,
          enhancedMetrics: null,
          isConnected: false,
          connectionStatus: 'disconnected',
          error: null,
          lastSyncTime: null
        });
      }
    }),
    {
      name: 'weaviate-storage',
      partialize: (state) => ({
        dataSource: state.dataSource,
        lastSyncTime: state.lastSyncTime
      }),
    }
  )
);
