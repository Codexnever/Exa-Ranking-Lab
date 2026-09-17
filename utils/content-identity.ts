import { createHash } from "crypto"
import type { SearchResult } from "@/types/type"

export function computeContentHash(
  result: SearchResult,
): string {
  const content = [
    result.title ?? "",
    result.snippet ?? "",
    result.fullText?.slice(0, 5000) ?? "",
    result.url ?? "",
  ]
    .join("|")
    .trim()
    .toLowerCase()

  return createHash("sha256")
    .update(content)
    .digest("hex")
}

export function getContentHash(
  result: SearchResult,
): string {
  return (
    result.contentHash ??
    computeContentHash(result)
  )
}