import { createHash } from "crypto"

export const CANONICALIZATION_VERSION = "1" as const

export const TRACKING_PARAMETERS_V1 = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "gclid", "fbclid", "msclkid",
])

export interface DocumentIdentity {
  canonicalUrl: string
  documentKey: string
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

/** Canonical URL identity policy v1. Throws for invalid or non-HTTP(S) URLs. */
export function canonicalizeDocumentUrl(rawUrl: string): string {
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
    throw new TypeError("Document URL must be a non-empty string")
  }

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new TypeError(`Invalid document URL: ${rawUrl}`)
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`Document URL must use HTTP or HTTPS: ${rawUrl}`)
  }

  const wasDefaultPort = (url.protocol === "http:" && url.port === "80")
    || (url.protocol === "https:" && url.port === "443")
  if (wasDefaultPort) url.port = ""
  url.protocol = "https:"
  url.hostname = url.hostname.toLowerCase()
  url.hash = ""
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "") || "/"

  const retained = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMETERS_V1.has(key.toLowerCase()))
    .sort(([keyA, valueA], [keyB, valueB]) => keyA.localeCompare(keyB) || valueA.localeCompare(valueB))
  url.search = ""
  for (const [key, value] of retained) url.searchParams.append(key, value)

  return url.toString()
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
