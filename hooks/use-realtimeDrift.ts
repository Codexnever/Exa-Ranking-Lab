// hooks/use-real-time-drift.ts (new - fixed)
import { useEffect } from "react";
import { client } from "@/app/server/appwrite";
import { useDriftStore } from "@/app/store"; // Your drift store
import { useAuth } from "@/lib/contexts/auth-context";
import { DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite";
import type { RankingSnapshot } from "@/lib/type"; // Fixed: Import missing type

export function useRealTimeDrift() {
  const { userId } = useAuth();
  const fetchDriftResults = useDriftStore((state) => state.fetchDriftResults); // Assuming you added this as per previous response

  useEffect(() => {
    if (!userId) return;

    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.SNAPSHOTS}.documents`, // Tie to snapshots (source of drift)
      async (payload) => {
        console.log("[Real-Time] Drift-related event (from snapshots):", payload.events); // Fixed: Use 'events' array

        const document = payload.payload as RankingSnapshot; // Fixed: Use imported type

        if (document.userId !== userId) return; // Match current user

        if (payload.events.includes('database.documents.create') || payload.events.includes('database.documents.update')) { // Fixed: Use 'includes' for array comparison
          await fetchDriftResults(userId); // Refetch drift results
        }
      }
    );

    return () => unsubscribe();
  }, [userId, fetchDriftResults]);
}
