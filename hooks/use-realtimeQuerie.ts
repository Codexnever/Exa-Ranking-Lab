"use client"

import { useEffect } from "react";
import { client } from "@/app/server/appwrite";
import { useQueriesStore } from "@/app/store";
import { useAuth } from "@/lib/contexts/auth-context";
import { useConnectionHealth } from "@/components/providers/ConnectionHealthProvider";
import { DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite";
import type { QueryConfig } from "@/lib/type";

export function useRealTimeQueries() {
  const { userId } = useAuth();
  const { recordActivity, recordError, recordReconnectAttempt } = useConnectionHealth();
  const fetchQueries = useQueriesStore((state) => state.fetchQueries);

  useEffect(() => {
    if (!userId || !fetchQueries) return;

    let unsubscribe: (() => void) | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;

    const setupSubscription = async () => {
      try {
        console.log('[RealTime] Setting up queries subscription');
        
        unsubscribe = client.subscribe(
          `databases.${DATABASE_ID}.collections.${COLLECTIONS.QUERIES}.documents`,
          async (payload) => {
            const startTime = Date.now();
            
            try {
              console.log("[Real-Time] Query events:", payload.events);

              const document = payload.payload as QueryConfig;
              if (document?.userId !== userId) return;

              if (payload.events?.includes('database.documents.create') || 
                  payload.events?.includes('database.documents.update') ||
                  payload.events?.includes('database.documents.delete')) {
                
                await fetchQueries(userId);
                
                // ✅ Record successful activity with response time
                const responseTime = Date.now() - startTime;
                recordActivity('queries-update', responseTime);
                
                // Reset reconnect attempts on success
                reconnectAttempts = 0;
                
                console.log("[Real-Time] Queries updated successfully");
              }
            } catch (error) {
              console.error("[Real-Time] Error processing query event:", error);
              recordError(error instanceof Error ? error.message : 'Query processing failed');
            }
          }
        );
        
        // ✅ Record successful subscription setup
        recordActivity('queries-subscription');
        reconnectAttempts = 0;
        console.log('[RealTime] Queries subscription established');
        
      } catch (error) {
        console.error("[Real-Time] Query subscription setup failed:", error);
        recordError(error instanceof Error ? error.message : 'Query subscription failed');
        recordReconnectAttempt();
        reconnectAttempts++;
        
        // Exponential backoff for reconnection
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Max 30 seconds
        reconnectTimer = setTimeout(() => {
          if (userId) {
            console.log(`[RealTime] Retrying queries subscription (attempt ${reconnectAttempts + 1})...`);
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
          console.log('[RealTime] Queries subscription cleaned up');
        } catch (error) {
          console.error("[Real-Time] Queries cleanup error:", error);
        }
      }
    };
  }, [userId, fetchQueries, recordActivity, recordError, recordReconnectAttempt]);
}
