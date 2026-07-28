// hooks/use-query-form-logic.ts
"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import type { QueryConfig, ExaCategory } from "@/types/type"
import { useAuth } from "@/lib/middleware/authentication/auth-context"

// ─── Zod schema ───────────────────────────────────────────────────────────────
//  No .transform() on domain arrays — validation is done in handleDomainAdd
//    so zod transforms are redundant and their errors don't surface cleanly.
//  No .default([]) — defaultValues in useForm handles initial state.

const formSchema = z.object({
  name: z.string()
    .min(2,   "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters"),
 
  query: z.string()
    .min(2,    "Query must be at least 2 characters")
    .max(1000, "Query must be less than 1000 characters"),
 
  category: z.enum([
    "company", "research paper", "news", "pdf", "github",
    "tweet", "personal site", "linkedin profile", "financial report",
  ]),
 
  filters: z.object({
    numResults:     z.number().int().min(1).max(100),
    includeDomains: z.array(z.string()),
    excludeDomains: z.array(z.string()),
    startDate:      z.string().datetime().optional(),
    endDate:        z.string().datetime().optional(),
  }),
 
  schedule: z.object({
    enabled:   z.boolean(),
    frequency: z.enum(["hourly", "daily", "weekly"]),
  }),
 
  tags: z.array(z.string().max(50)).max(10),
})
 
export type QueryFormSchema = z.infer<typeof formSchema>
 
// ─── Input sanitization ───────────────────────────────────────────────────────
// Used in onFormSubmit and domain/tag handlers.
// Strips HTML and control characters — appropriate defence-in-depth even
// though the data is stored as JSON (not rendered as raw HTML server-side).
 
function sanitizeInput(input: string): string {
  if (typeof input !== "string") return ""
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
}
 
function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const result = {} as T
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key as keyof T] = sanitizeInput(value) as T[keyof T]
    } else if (Array.isArray(value)) {
      result[key as keyof T] = value.map(item =>
        typeof item === "string" ? sanitizeInput(item) : item
      ) as T[keyof T]
    } else if (value && typeof value === "object") {
      result[key as keyof T] = sanitizeObject(value) as T[keyof T]
    } else {
      result[key as keyof T] = value
    }
  }
  return result
}
 
// ─── Domain validation ────────────────────────────────────────────────────────
 
function validateDomain(domain: string): boolean {
  if (!domain?.trim()) return false
  try {
    const clean = domain.replace(/^https?:\/\//, "").toLowerCase()
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/
    if (domainRegex.test(clean)) return true
    const url = domain.startsWith("http") ? new URL(domain) : new URL(`https://${domain}`)
    return url.hostname.includes(".")
  } catch {
    return false
  }
}
 
// ─── Hook ─────────────────────────────────────────────────────────────────────
 
export function useQueryFormLogic(
  onSubmit:      (data: Omit<QueryConfig, "id" | "createdAt" | "userId">) => void,
  editingQuery?: QueryConfig | null
) {
  const { userId } = useAuth()
 
  const [domainInput, setDomainInput] = useState("")
  const [tagInput,    setTagInput]    = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
 
  // ── Form setup ──────────────────────────────────────────────────────────────
 
  const form = useForm<QueryFormSchema>({
    resolver:      zodResolver(formSchema),
    mode:          "onChange",
    defaultValues: editingQuery
      ? {
          name:     editingQuery.name     ?? "",
          query:    editingQuery.query    ?? "",
          category: (editingQuery.category ?? "news") as ExaCategory,
          // ✅ Always provide arrays — never undefined
          tags:     Array.isArray(editingQuery.tags) ? editingQuery.tags : [],
          filters: {
            numResults:     editingQuery.filters?.numResults     ?? 50,
            includeDomains: Array.isArray(editingQuery.filters?.includeDomains)
              ? editingQuery.filters.includeDomains : [],
            excludeDomains: Array.isArray(editingQuery.filters?.excludeDomains)
              ? editingQuery.filters.excludeDomains : [],
            startDate: editingQuery.filters?.startDate,
            endDate:   editingQuery.filters?.endDate,
          },
          schedule: {
            enabled:   editingQuery.schedule?.enabled   ?? false,
            frequency: editingQuery.schedule?.frequency ?? "daily",
          },
        }
      : {
          name:     "",
          query:    "",
          category: "news" as ExaCategory,
          tags:     [],
          filters: {
            numResults:     50,
            includeDomains: [],
            excludeDomains: [],
            startDate:      undefined,
            endDate:        undefined,
          },
          schedule: {
            enabled:   false,
            frequency: "daily",
          },
        },
  })
 
  // ✅ Single source of truth for tags — read directly from form state.
  //    Previously: selectedTags useState + form.setValue("tags") called together
  //    every time — two sources that could diverge.
  //    Now: form.watch("tags") is the only state; no separate useState needed.
  const selectedTags = form.watch("tags") ?? []
 
  // ── Sanitize on change — correct approach ──────────────────────────────────
  // ✅ Previous code used useEffect + form.watch + form.setValue which created
  //    a potential infinite loop (watch → setValue → watch → ...).
  //    Correct pattern: sanitize in the zod schema (.trim()) and in onFormSubmit.
  //    No watch-based sanitization needed.
 
  // ── Domain handlers ─────────────────────────────────────────────────────────
 
  const handleDomainAdd = (domain: string, type: "include" | "exclude") => {
    const clean = sanitizeInput(domain).toLowerCase()
    if (!clean) return
 
    if (!validateDomain(clean)) {
      const field = type === "include"
        ? "filters.includeDomains" as const
        : "filters.excludeDomains" as const
      form.setError(field, { type: "manual", message: "Invalid domain format" })
      return
    }
 
    const field   = type === "include"
      ? "filters.includeDomains" as const
      : "filters.excludeDomains" as const
    const current = form.getValues(field)
 
    if (!current.includes(clean)) {
      form.setValue(field, [...current, clean])
      form.clearErrors(field)
    }
    setDomainInput("")
  }
 
  const handleDomainRemove = (domain: string, type: "include" | "exclude") => {
    const field   = type === "include"
      ? "filters.includeDomains" as const
      : "filters.excludeDomains" as const
    const current = form.getValues(field)
    form.setValue(field, current.filter(d => d !== domain))
  }
 
  // ── Tag handlers ────────────────────────────────────────────────────────────
 
  const handleTagSelect = (tag: string) => {
    const clean = sanitizeInput(tag)
    if (!clean || selectedTags.includes(clean)) return
 
    if (selectedTags.length >= 10) {
      form.setError("tags", { type: "manual", message: "Maximum 10 tags allowed" })
      return
    }
 
    form.setValue("tags", [...selectedTags, clean])
    form.clearErrors("tags")
    setTagInput("")
  }
 
  const handleTagRemove = (tag: string) => {
    form.setValue("tags", selectedTags.filter(t => t !== tag))
    form.clearErrors("tags")
  }
 
  // ── Form submission ─────────────────────────────────────────────────────────
 
  const onFormSubmit = async (data: QueryFormSchema) => {
    if (!userId) {
      form.setError("root", { message: "Authentication required" })
      return
    }
    if (isSubmitting) return
 
    setIsSubmitting(true)
    try {
      // Sanitize all string fields before submitting
      const sanitized = sanitizeObject(data)
 
      // Cross-field date validation
      if (sanitized.filters.startDate && sanitized.filters.endDate) {
        if (new Date(sanitized.filters.startDate) >= new Date(sanitized.filters.endDate)) {
          form.setError("filters.endDate", {
            type:    "manual",
            message: "End date must be after start date",
          })
          return
        }
      }
 
      const queryData: Omit<QueryConfig, "id" | "createdAt" | "userId"> = {
        ...sanitized,
        // tags comes from form state (single source of truth)
        tags: sanitized.tags,
      }
 
      await onSubmit(queryData)
 
      // Reset all local state on successful create (not edit)
      if (!editingQuery) {
        form.reset()
        setDomainInput("")
        setTagInput("")
        // form.reset() resets tags to [] via defaultValues — no extra state to clear
      }
    } catch (err) {
      console.error("[QueryForm] submission error:", err)
      form.setError("root", {
        message: err instanceof Error ? err.message : "Submission failed",
      })
    } finally {
      setIsSubmitting(false)
    }
  }
 
  // ── Return ──────────────────────────────────────────────────────────────────
 
  return {
    form,
    // ✅ selectedTags is derived from form state — single source of truth
    selectedTags,
    domainInput,
    setDomainInput,
    tagInput,
    setTagInput,
    handleDomainAdd,
    handleDomainRemove,
    handleTagSelect,
    handleTagRemove,
    onFormSubmit,
    isSubmitting,
    validateDomain,
  }
}
 
export { CATEGORY_MAP, CATEGORY_MAP_REVERSE } from "@/constants/category-map"
 