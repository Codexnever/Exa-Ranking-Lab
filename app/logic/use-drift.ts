// hooks/use-drift.ts
import { useState, useEffect } from "react";
import type { DriftAnalysisResult } from "@/lib/type";

export function useDrift(queryid: string) {
  const [driftResult, setDriftResult] = useState<DriftAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchQueryDrift() {
      try {
        setLoading(true);
        const response = await fetch(`/api/drift/${queryid}`);

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Query not found");
          } else if (response.status === 400) {
            throw new Error("Not enough snapshots to analyze drift");
          } else {
            throw new Error("Failed to fetch drift data");
          }
        }

        const data = await response.json();
        setDriftResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchQueryDrift();
  }, [queryid]);

  return { driftResult, setDriftResult, loading, setLoading, error, setError };
}
