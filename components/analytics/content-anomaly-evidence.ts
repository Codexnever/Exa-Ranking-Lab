import { canonicalizeDocumentUrl } from "@/utils/canonicalize-url-policy"

export interface ContentAnomalyObservation {
  queryId?: string
  queryName?: string
  url?: string
  title?: string
  timestamp?: string
  anomalyScore?: number
}

export function summarizeContentAnomalies(observations: ContentAnomalyObservation[]) {
  const queryIds = new Set<string>()
  const documents = new Set<string>()
  for (const observation of observations) {
    if (observation.queryId) queryIds.add(observation.queryId)
    if (!observation.url) continue
    try {
      documents.add(canonicalizeDocumentUrl(observation.url))
    } catch {
      documents.add(`raw:${observation.url.trim()}`)
    }
  }
  return {
    observations: [...observations].sort((left, right) =>
      Number(right.anomalyScore ?? 0) - Number(left.anomalyScore ?? 0)),
    affectedQueries: queryIds.size,
    uniqueDocuments: documents.size,
  }
}
