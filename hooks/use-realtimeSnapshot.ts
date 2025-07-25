// hooks/use-realtimeSnapshots.ts
"use client"

import { useEffect } from "react";
import { client } from "@/app/server/appwrite";
import { useSnapshotsStore } from "@/app/store";
import { useAuth } from "@/lib/contexts/auth-context";
import { useConnectionHealth } from "@/components/providers/ConnectionHealthProvider";
import { DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite";
import type { RankingSnapshot } from "@/lib/type";

export function useRealTimeSnapshots() {
  const { userId } = useAuth();
  const { recordActivity, recordError, recordReconnectAttempt } = useConnectionHealth();
  const fetchSnapshotsComplete = useSnapshotsStore((state) => state.fetchSnapshotsComplete);
  const pagination = useSnapshotsStore((state) => state.pagination);

  useEffect(() => {
    if (!userId) return;

    let unsubscribe: (() => void) | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;

    const setupSubscription = async () => {
      try {
        console.log('[RealTime] Setting up snapshots subscription for user:', userId);
        
        unsubscribe = client.subscribe(
          `databases.${DATABASE_ID}.collections.${COLLECTIONS.SNAPSHOTS}.documents`,
          async (payload) => {
            const startTime = Date.now();
            
            try {
              console.log("[Real-Time] Snapshot events:", payload.events);

              const document = payload.payload as RankingSnapshot;
              if (!document?.userId || document.userId !== userId) {
                console.log('[RealTime] Ignoring snapshot event for different user:', document?.userId);
                return;
              }

              if (payload.events?.includes('database.documents.create') || 
                  payload.events?.includes('database.documents.update')) {
                
                console.log('[RealTime] Processing snapshot event for:', document.id);
                
                // ✅ Refresh both paginated and complete datasets
                setTimeout(async () => {
                  try {
                    await fetchSnapshotsComplete(
                      pagination.currentPage, 
                      pagination.itemsPerPage, 
                      userId
                    );
                    console.log("[Real-Time] Snapshots refreshed successfully");
                  } catch (error) {
                    console.error("[Real-Time] Failed to refresh snapshots:", error);
                  }
                }, 500); // 500ms delay to ensure database consistency
                
                // ✅ Record successful activity with response time
                const responseTime = Date.now() - startTime;
                recordActivity('snapshots-update', responseTime);
                
                // Reset reconnect attempts on success
                reconnectAttempts = 0;
              }
            } catch (error) {
              console.error("[Real-Time] Error processing snapshot event:", error);
              recordError(error instanceof Error ? error.message : 'Snapshot processing failed');
            }
          }
        );
        
        // ✅ Record successful subscription setup
        recordActivity('snapshots-subscription');
        reconnectAttempts = 0;
        console.log('[RealTime] Snapshots subscription established');
        
      } catch (error) {
        console.error("[Real-Time] Snapshot subscription setup failed:", error);
        recordError(error instanceof Error ? error.message : 'Snapshots subscription failed');
        recordReconnectAttempt();
        reconnectAttempts++;
        
        // Exponential backoff for reconnection
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Max 30 seconds
        reconnectTimer = setTimeout(() => {
          if (userId) {
            console.log(`[RealTime] Retrying snapshots subscription (attempt ${reconnectAttempts + 1})...`);
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
          console.log('[RealTime] Snapshots subscription cleaned up');
        } catch (error) {
          console.error("[Real-Time] Snapshots cleanup error:", error);
        }
      }
    };
  }, [userId, fetchSnapshotsComplete, pagination.currentPage, pagination.itemsPerPage, recordActivity, recordError, recordReconnectAttempt]);
}
