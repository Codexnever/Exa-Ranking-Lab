// hooks/use-real-time-snapshots.ts (new - fixed)
import { useEffect } from "react";
import { client } from "@/app/server/appwrite";
import { useSnapshotsStore } from "@/app/store";
import { useAuth } from "@/lib/contexts/auth-context";
import { DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite";
import type { RankingSnapshot } from "@/lib/type"; // Fixed: Import missing type

export function useRealTimeSnapshots() {
  const { userId: currentUserId } = useAuth();
  const fetchSnapshots = useSnapshotsStore((state) => state.fetchSnapshots);

  useEffect(() => {
    if (!currentUserId) return;

    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.SNAPSHOTS}.documents`,
      async (payload) => {
        console.log("[Real-Time] Snapshot event:", payload.events); // Fixed: Use 'events' array

        const document = payload.payload as RankingSnapshot; // Fixed: Use imported type

        if (document.userId !== currentUserId) return; // Match current user

        if (payload.events.includes('database.documents.create') || payload.events.includes('database.documents.update')) { // Fixed: Use 'includes' for array
          await fetchSnapshots(undefined, currentUserId); // Refetch for user
        }
      }
    );

    return () => unsubscribe();
  }, [currentUserId, fetchSnapshots]);
}
