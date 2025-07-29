// hooks/use-realtimeAnalytics.ts
"use client"

import { useEffect } from "react";
import { client } from "@/app/server/appwrite";
import { useSnapshotsStore } from "@/app/store";
import { useAnalyticsStore } from "@/app/store";
import { useAuth } from "@/lib/contexts/auth-context";
import { useConnectionHealth } from "@/components/providers/ConnectionHealthProvider";
import { DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite";
import type { RankingSnapshot } from "@/lib/type";

export function useRealTimeAnalytics() {
  const { user } = useAuth();
  const { recordActivity, recordError, recordReconnectAttempt } = useConnectionHealth();
  
  //  Updated to use new store methods
  const fetchAllSnapshots = useSnapshotsStore((state) => state.fetchAllSnapshots);
  const fetchSnapshotsComplete = useSnapshotsStore((state) => state.fetchSnapshotsComplete);
  const pagination = useSnapshotsStore((state) => state.pagination);
  
  const calculateAnalytics = useAnalyticsStore((state) => state.calculateAnalyticsFromSnapshots);

  useEffect(() => {
    if (!user?.$id) return; //  Updated user check

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
              console.log("[Real-Time] Analytics - Snapshot events:", payload.events);

              const document = payload.payload as RankingSnapshot;
              
              //  Updated user check
              if (!document?.userId || document.userId !== user.$id) {
                console.log('[RealTime] Ignoring snapshot event for different user:', document?.userId);
                return;
              }

              if (payload.events?.includes('database.documents.create') || 
                  payload.events?.includes('database.documents.update')) {
                
                console.log('[RealTime] Processing analytics update for snapshot:', document.id);
                
                //  Refresh both paginated and complete datasets with delay for DB consistency
                setTimeout(async () => {
                  try {
                    // Refresh complete snapshots for analytics
                    await fetchAllSnapshots(user.$id);
                    
                    //  Get fresh snapshots from store (avoid stale closure)
                    const freshSnapshots = useSnapshotsStore.getState().allSnapshots; // ✅ Use allSnapshots
                    
                    //  Calculate analytics with fresh data
                    if (freshSnapshots.length > 0) {
                      calculateAnalytics(freshSnapshots);
                    }
                    
                    //  Record successful activity with response time
                    const responseTime = Date.now() - startTime;
                    recordActivity('analytics-update', responseTime);
                    
                    // Reset reconnect attempts on success
                    reconnectAttempts = 0;
                    
                    console.log('[RealTime] Analytics updated successfully with', freshSnapshots.length, 'snapshots');
                  } catch (refreshError) {
                    console.error("[Real-Time] Failed to refresh analytics data:", refreshError);
                    recordError(refreshError instanceof Error ? refreshError.message : 'Analytics refresh failed');
                  }
                }, 500); // 500ms delay to ensure database consistency
              }
            } catch (error) {
              console.error("[Real-Time] Analytics processing error:", error);
              recordError(error instanceof Error ? error.message : 'Analytics processing failed');
            }
          }
        );
        
        //  Record successful subscription setup
        recordActivity('analytics-subscription');
        reconnectAttempts = 0;
        console.log('[RealTime] Analytics subscription established');
        
      } catch (error) {
        console.error("[Real-Time] Analytics subscription setup failed:", error);
        recordError(error instanceof Error ? error.message : 'Analytics subscription failed');
        recordReconnectAttempt();
        reconnectAttempts++;
        
        // Exponential backoff for reconnection
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Max 30 seconds
        reconnectTimer = setTimeout(() => {
          if (user?.$id) {
            console.log(`[RealTime] Retrying analytics subscription (attempt ${reconnectAttempts + 1})...`);
            setupSubscription();
          }
        }, delay);
      }
    };

    setupSubscription();

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      
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
