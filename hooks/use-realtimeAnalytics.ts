// hooks/use-realtimeAnalytics.ts
"use client"

import { useEffect } from "react";
import { client } from "@/app/server/appwrite";
import { useSnapshotsStore } from "@/app/store";
import { useAnalyticsStore } from '@/app/store';
import { useAuth } from "@/lib/contexts/auth-context";
import { useConnectionHealth } from "@/components/providers/ConnectionHealthProvider";
import { DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite";
import type { RankingSnapshot } from "@/lib/type";

export function useRealTimeAnalytics() {
  const { user } = useAuth(); // ✅ Changed from userId to user
  const { recordActivity, recordError, recordReconnectAttempt } = useConnectionHealth();
  
  // ✅ Updated to use new store methods
  const fetchAllSnapshots = useSnapshotsStore((state) => state.fetchAllSnapshots);
  const calculateAnalytics = useAnalyticsStore((state) => state.calculateAnalyticsFromSnapshots);

  useEffect(() => {
    if (!user?.$id) return;

    let unsubscribe: (() => void) | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;

    const setupSubscription = async () => {
      try {
        console.log('[RealTime] Setting up analytics subscription for user:', user.$id);
        
        unsubscribe = client.subscribe(
          `databases.${DATABASE_ID}.collections.${COLLECTIONS.SNAPSHOTS}.documents`,
          async (payload) => {
            const startTime = Date.now();
            
            try {
              const document = payload.payload as RankingSnapshot;
              
              if (!document?.userId || document.userId !== user.$id) {
                return;
              }

              if (payload.events?.includes('database.documents.create') || 
                  payload.events?.includes('database.documents.update')) {
                
                // ✅ Refresh with delay for DB consistency
                setTimeout(async () => {
                  try {
                    await fetchAllSnapshots(user.$id);
                    
                    const freshSnapshots = useSnapshotsStore.getState().allSnapshots;
                    
                    if (freshSnapshots.length > 0) {
                      calculateAnalytics(freshSnapshots);
                    }
                    
                    const responseTime = Date.now() - startTime;
                    recordActivity('analytics-update', responseTime);
                    reconnectAttempts = 0;
                    
                    console.log('[RealTime] Analytics updated successfully');
                  } catch (refreshError) {
                    console.error("[Real-Time] Analytics refresh failed:", refreshError);
                    recordError(refreshError instanceof Error ? refreshError.message : 'Analytics refresh failed');
                  }
                }, 500);
              }
            } catch (error) {
              console.error("[Real-Time] Analytics processing error:", error);
              recordError(error instanceof Error ? error.message : 'Analytics processing failed');
            }
          }
        );
        
        recordActivity('analytics-subscription');
        reconnectAttempts = 0;
        console.log('[RealTime] Analytics subscription established');
        
      } catch (error) {
        console.error("[Real-Time] Analytics subscription setup failed:", error);
        recordError(error instanceof Error ? error.message : 'Analytics subscription failed');
        recordReconnectAttempt();
        reconnectAttempts++;
        
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        reconnectTimer = setTimeout(() => {
          if (user?.$id) {
            setupSubscription();
          }
        }, delay);
      }
    };

    setupSubscription();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (unsubscribe) {
        try {
          unsubscribe();
          console.log('[RealTime] Analytics subscription cleaned up');
        } catch (error) {
          console.error("[Real-Time] Analytics cleanup error:", error);
        }
      }
    };
  }, [user?.$id, fetchAllSnapshots, calculateAnalytics, recordActivity, recordError, recordReconnectAttempt]);
}
