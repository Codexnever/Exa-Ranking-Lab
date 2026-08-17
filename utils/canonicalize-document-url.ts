import { createHash } from "crypto"
import { canonicalizeDocumentUrl } from "./canonicalize-url-policy"
export { CANONICALIZATION_VERSION,TRACKING_PARAMETERS_V1,canonicalizeDocumentUrl } from "./canonicalize-url-policy"

export interface DocumentIdentity {
  canonicalUrl: string
  documentKey: string
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

export function createDocumentKey(canonicalUrl: string): string {
  if (canonicalizeDocumentUrl(canonicalUrl) !== canonicalUrl) {
    throw new TypeError("createDocumentKey requires a canonical URL")
  }
  return sha256(canonicalUrl)
}

export function getDocumentIdentity(rawUrl: string): DocumentIdentity {
  const canonicalUrl = canonicalizeDocumentUrl(rawUrl)
  return { canonicalUrl, documentKey: createDocumentKey(canonicalUrl) }
}

export function createJudgmentKey(datasetVersionId: string, evaluationQueryId: string, documentKey: string): string {
  for (const [name, value] of Object.entries({ datasetVersionId, evaluationQueryId, documentKey })) {
    if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} must be non-empty`)
  }
  return sha256(`${datasetVersionId}\n${evaluationQueryId}\n${documentKey}`)
}

export function createEvaluationQueryKey(datasetVersionId: string, sourceQueryId: string): string {
  for (const [name, value] of Object.entries({ datasetVersionId, sourceQueryId })) {
    if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} must be non-empty`)
  }
  return sha256(`${datasetVersionId}\n${sourceQueryId}`)
}
