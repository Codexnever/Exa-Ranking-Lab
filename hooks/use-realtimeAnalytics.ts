// hooks/use-realtimeAnalytics.ts
import { useEffect } from "react";
import { client } from "@/app/server/appwrite"; // Your Appwrite client
import { useSnapshotsStore } from "@/app/store"; // Assuming your snapshots store
import { useAnalyticsStore } from "@/app/store"; // Your analytics store
import { DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite"; // Your constants

export function useRealTimeAnalytics() {
  const fetchSnapshots = useSnapshotsStore((state) => state.fetchSnapshots);
  const snapshots = useSnapshotsStore((state) => state.snapshots);
  const calculateAnalytics = useAnalyticsStore((state) => state.calculateAnalyticsFromSnapshots);

  useEffect(() => {
    // Subscribe to real-time events for SNAPSHOTS collection
    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.SNAPSHOTS}.documents`,
      (payload) => {
        console.log("[Real-Time] Snapshot event:", payload.events); // Fixed: Use 'events' array

        // Check if the event array includes the desired events
        if (payload.events.includes('database.documents.create') || payload.events.includes('database.documents.update')) {
          // Refetch snapshots on create/update
          fetchSnapshots();
          // Recalculate analytics with new snapshots
          calculateAnalytics(snapshots);
        }
      }
    );

    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
  }, [fetchSnapshots, snapshots, calculateAnalytics]);
}
