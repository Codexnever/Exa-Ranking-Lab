"use client"

import { useEffect, useRef } from "react";
import { client } from "@/app/server/appwrite/appwrite";
import { useDriftStore } from "@/app/store";
import { useAuth } from "@/lib/middleware/authentication/auth-context";
import { useConnectionHealth } from "@/monitoring/healthcheck/ConnectionHealthProvider";
import { DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite/appwrite";
import type { RankingSnapshot } from "@/types/type";

export function useRealTimeDrift() {
  const { userId } = useAuth();
  const { fetchDriftResults } = useDriftStore();
  const { recordActivity, recordError, recordReconnectAttempt } = useConnectionHealth();
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!userId || !fetchDriftResults) return;

    let unsubscribe: (() => void) | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;

    const setupSubscription = async () => {
      try {
        console.log('[RealTime] Setting up drift subscription');
        
        unsubscribe = client.subscribe(
          `databases.${DATABASE_ID}.collections.${COLLECTIONS.SNAPSHOTS}.documents`,
          async (payload) => {
            const startTime = Date.now();
            
            try {
              console.log("[Real-Time] Drift-related events:", payload.events);

              const document = payload.payload as RankingSnapshot;
              if (document?.userId !== userId) return;

              if (payload.events?.includes('database.documents.create') || 
                  payload.events?.includes('database.documents.update')) {
                
                // Debounce updates to prevent excessive API calls
                const now = Date.now();
                if (now - lastUpdateRef.current < 5000) { // 5 second debounce
                  console.log("[Real-Time] Debouncing drift update");
                  return;
                }
                
                lastUpdateRef.current = now;
                
                // Force refresh since we have new data
                await fetchDriftResults(userId, true);
                
                // ✅ Record successful activity with response time
                const responseTime = Date.now() - startTime;
                recordActivity('drift-update', responseTime);
                
                // Reset reconnect attempts on success
                reconnectAttempts = 0;
                
                console.log("[Real-Time] Drift data updated successfully");
              }
            } catch (error) {
              console.error("[Real-Time] Error processing drift event:", error);
              recordError(error instanceof Error ? error.message : 'Drift processing failed');
            }
          }
        );
        
        // ✅ Record successful subscription setup
        recordActivity('drift-subscription');
        reconnectAttempts = 0;
        console.log('[RealTime] Drift subscription established');
        
      } catch (error) {
        console.error("[Real-Time] Drift subscription setup failed:", error);
        recordError(error instanceof Error ? error.message : 'Drift subscription failed');
        recordReconnectAttempt();
        reconnectAttempts++;
        
        // Exponential backoff for reconnection
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Max 30 seconds
        reconnectTimer = setTimeout(() => {
          if (userId) {
            console.log(`[RealTime] Retrying drift subscription (attempt ${reconnectAttempts + 1})...`);
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
          console.log('[RealTime] Drift subscription cleaned up');
        } catch (error) {
          console.error("[Real-Time] Drift cleanup error:", error);
        }
      }
    };
  }, [userId, fetchDriftResults, recordActivity, recordError, recordReconnectAttempt]);
}
