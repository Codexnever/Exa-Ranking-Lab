// hooks/use-real-time-queries.ts (new - fixed)
import { useEffect } from "react";
import { client } from "@/app/server/appwrite";
import { useQueriesStore } from "@/app/store";
import { useAuth } from "@/lib/contexts/auth-context"; // For current user
import { DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite";
import type { QueryConfig } from "@/lib/type"; // Fixed: Import missing type

export function useRealTimeQueries() {
  const { userId } = useAuth();
  const fetchQueries = useQueriesStore((state) => state.fetchQueries);

  useEffect(() => {
    if (!userId) return;

    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.QUERIES}.documents`,
      async (payload) => {
        console.log("[Real-Time] Query event:", payload.events); // Fixed: Use 'events' array

        const document = payload.payload as QueryConfig; // Fixed: Use imported type

        if (document.userId !== userId) return; // Match current user

        if (payload.events.includes('database.documents.create') || payload.events.includes('database.documents.update')) { // Fixed: Use 'includes' for array
          await fetchQueries(userId); // Refetch for user
        }
      }
    );

    return () => unsubscribe();
  }, [userId, fetchQueries]);
}
