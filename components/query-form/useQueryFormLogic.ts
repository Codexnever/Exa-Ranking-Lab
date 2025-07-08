"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import type { QueryConfig } from "@/lib/types"
import { useAuth } from "@/contexts/auth-context"
import { useAnalytics } from "@/hooks/use-analytics"

const QueryCategory = z.enum([
  "company",
  "research paper",
  "news",
  "pdf",
  "github",
  "tweet",
  "personal site",
  "linkedin profile",
  "financial report",
])
const QueryFrequency = z.enum(["hourly", "daily", "weekly"])

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  query: z.string().min(2, "Query must be at least 2 characters"),
  category: QueryCategory,
  filters: z.object({
    numResults: z.number().min(1).max(100),
    includeDomains: z.array(z.string()),
    excludeDomains: z.array(z.string()),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
  schedule: z.object({
    enabled: z.boolean(),
    frequency: QueryFrequency,
  }),
  tags: z.array(z.string()),
})

type FormSchema = z.infer<typeof formSchema>

export function useQueryFormLogic(
  onSubmit: (data: Omit<QueryConfig, "id" | "createdAt" | "userId">) => void,
  editingQuery?: QueryConfig | null
) {
  const { userId } = useAuth()
  const [selectedTags, setSelectedTags] = useState<string[]>(editingQuery?.tags || [])
  const [domainInput, setDomainInput] = useState("")
  const [tagInput, setTagInput] = useState("")

  const { analytics, fetchAnalytics } = useAnalytics()
  useEffect(() => {
    fetchAnalytics()
  }, [])

  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: editingQuery
      ? {
          ...editingQuery,
          tags: editingQuery.tags || [],
          filters: editingQuery.filters || { numResults: 10, includeDomains: [], excludeDomains: [] },
          schedule: editingQuery.schedule || { enabled: false, frequency: "daily" },
        }
      : {
          name: "",
          query: "",
          category: "news",
          filters: {
            numResults: 10,
            includeDomains: [],
            excludeDomains: [],
          },
          schedule: {
            enabled: false,
            frequency: "daily",
          },
          tags: [],
        },
  })

  const handleDomainAdd = (domain: string, type: "include" | "exclude") => {
    const field = `filters.${type === "include" ? "includeDomains" : "excludeDomains"}` as const
    const current = form.getValues(field)
    if (domain && !current.includes(domain)) {
      form.setValue(field, [...current, domain])
    }
    setDomainInput("")
  }

  const handleDomainRemove = (domain: string, type: "include" | "exclude") => {
    const field = `filters.${type === "include" ? "includeDomains" : "excludeDomains"}` as const
    const current = form.getValues(field)
    form.setValue(field, current.filter((d) => d !== domain))
  }

  const handleTagSelect = (tag: string) => {
    if (!selectedTags.includes(tag)) {
      const newTags = [...selectedTags, tag]
      setSelectedTags(newTags)
      form.setValue("tags", newTags)
    }
    setTagInput("")
  }

  const handleTagRemove = (tag: string) => {
    const newTags = selectedTags.filter((t) => t !== tag)
    setSelectedTags(newTags)
    form.setValue("tags", newTags)
  }

  const onFormSubmit = (data: FormSchema) => {
    if (!userId) return
    const queryData: Omit<QueryConfig, "id" | "createdAt" | "userId"> = {
      ...data,
      tags: selectedTags,
    }
    onSubmit(queryData)
  }



  return {
    form,
    selectedTags,
    setSelectedTags,
    domainInput,
    setDomainInput,
    tagInput,
    setTagInput,
    handleDomainAdd,
    handleDomainRemove,
    handleTagSelect,
    handleTagRemove,
    onFormSubmit,
    QueryCategory,
    QueryFrequency,
  }
}

export { CATEGORY_MAP, CATEGORY_MAP_REVERSE } from "@/lib/category-map"
