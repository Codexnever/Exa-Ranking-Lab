import type { EvaluationDatasetStatus } from "@/types/evaluation"
import { invalid } from "./evaluation-errors"

export const MAX_QUERY_BATCH = 50
export const MAX_DATASET_NAME = 256
export const MAX_DESCRIPTION = 2000
const FAMILY_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("Request body must be a JSON object")
  return value as Record<string, unknown>
}
export function normalizeFamilyKey(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  if (!normalized || normalized.length > 128 || !FAMILY_KEY.test(normalized)) throw invalid("familyKey must contain only lowercase letters, numbers, and single hyphens")
  return normalized
}
export function parseCreateDatasetInput(value: unknown): { name: string; description?: string; familyKey?: string } {
  const body = record(value)
  if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > MAX_DATASET_NAME) throw invalid(`name must be 1-${MAX_DATASET_NAME} characters`)
  if (body.description !== undefined && (typeof body.description !== "string" || body.description.length > MAX_DESCRIPTION)) throw invalid(`description must be at most ${MAX_DESCRIPTION} characters`)
  if (body.familyKey !== undefined && typeof body.familyKey !== "string") throw invalid("familyKey must be a string")
  const allowed = new Set(["name", "description", "familyKey"])
  if (Object.keys(body).some(key => !allowed.has(key))) throw invalid("Request contains unsupported authoritative fields")
  return {
    name: body.name.trim(),
    ...(body.description?.toString().trim() ? { description: body.description.toString().trim() } : {}),
    ...(body.familyKey ? { familyKey: normalizeFamilyKey(body.familyKey) } : {}),
  }
}
export function parseCloneInput(value: unknown): { name?: string; description?: string } {
  const body = value === undefined || value === null ? {} : record(value)
  const allowed = new Set(["name", "description"])
  if (Object.keys(body).some(key => !allowed.has(key))) throw invalid("Clone request contains unsupported fields")
  if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > MAX_DATASET_NAME)) throw invalid("Invalid clone name")
  if (body.description !== undefined && (typeof body.description !== "string" || body.description.length > MAX_DESCRIPTION)) throw invalid("Invalid clone description")
  return { ...(body.name ? { name: body.name.trim() } : {}), ...(body.description !== undefined ? { description: body.description.trim() } : {}) }
}
export function parseQueryIds(value: unknown): string[] {
  const body = record(value)
  if (Object.keys(body).some(key => key !== "queryIds")) throw invalid("Only queryIds may be submitted")
  if (!Array.isArray(body.queryIds) || body.queryIds.length === 0 || body.queryIds.length > MAX_QUERY_BATCH) throw invalid(`queryIds must contain 1-${MAX_QUERY_BATCH} IDs`)
  const ids = body.queryIds.map(item => {
    if (typeof item !== "string" || !item.trim() || item.length > 64) throw invalid("Every query ID must be a non-empty string")
    return item.trim()
  })
  return [...new Set(ids)]
}
export function parseListInput(params: URLSearchParams): { status?: EvaluationDatasetStatus; familyKey?: string; limit: number; offset: number } {
  const status = params.get("status")
  if (status && !["draft", "frozen", "archived"].includes(status)) throw invalid("Invalid status filter")
  const family = params.get("familyKey")
  const limitRaw = params.get("limit") ?? "20", offsetRaw = params.get("offset") ?? "0"
  if (!/^\d+$/.test(limitRaw) || !/^\d+$/.test(offsetRaw)) throw invalid("limit and offset must be non-negative integers")
  const limit = Number(limitRaw), offset = Number(offsetRaw)
  if (limit < 1 || limit > 100 || offset > 10000) throw invalid("limit must be 1-100 and offset at most 10000")
  return { ...(status ? { status: status as EvaluationDatasetStatus } : {}), ...(family ? { familyKey: normalizeFamilyKey(family) } : {}), limit, offset }
}
export function assertRouteId(name: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 64) throw invalid(`${name} must be a non-empty ID`)
}
