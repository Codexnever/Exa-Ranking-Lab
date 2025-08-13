"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import type { QueryConfig } from "@/lib/type"
import { useAuth } from "@/lib/contexts/auth-context"
import { useAnalyticsStore } from "@/app/store"
import { useSecureApi } from '@/lib/use-secureApi'

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

// ✅ FIXED: Remove .default([]) to make arrays required, not optional
const formSchema = z.object({
  name: z.string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters")
    .trim(),
  query: z.string()
    .min(2, "Query must be at least 2 characters")
    .max(1000, "Query must be less than 1000 characters")
    .trim(),
  category: QueryCategory,
  filters: z.object({
    numResults: z.number().int().min(1).max(100),
    // ✅ FIXED: Remove .default([]) - arrays are required, defaults handled in useForm
    includeDomains: z.array(z.string())
      .transform((domains) => {
        // Validate each domain but don't change the type
        return domains.map(domain => {
          try {
            new URL(domain.startsWith('http') ? domain : `https://${domain}`)
            return domain
          } catch {
            throw new Error(`Invalid domain: ${domain}`)
          }
        })
      }),
    excludeDomains: z.array(z.string())
      .transform((domains) => {
        return domains.map(domain => {
          try {
            new URL(domain.startsWith('http') ? domain : `https://${domain}`)
            return domain
          } catch {
            throw new Error(`Invalid domain: ${domain}`)
          }
        })
      }),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
  schedule: z.object({
    enabled: z.boolean(),
    frequency: QueryFrequency,
  }),
  // ✅ FIXED: Remove .default([]) - array is required, default handled in useForm
  tags: z.array(z.string().max(50)).max(10),
})

type FormSchema = z.infer<typeof formSchema>

// Enhanced input sanitization function
function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return ''
  
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
}

// Recursive sanitization for nested objects
function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized = {} as T
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key as keyof T] = sanitizeInput(value) as T[keyof T]
    } else if (Array.isArray(value)) {
      sanitized[key as keyof T] = value.map(item => 
        typeof item === 'string' ? sanitizeInput(item) : item
      ) as T[keyof T]
    } else if (value && typeof value === 'object') {
      sanitized[key as keyof T] = sanitizeObject(value) as T[keyof T]
    } else {
      sanitized[key as keyof T] = value
    }
  }
  
  return sanitized
}

export function useQueryFormLogic(
  onSubmit: (data: Omit<QueryConfig, "id" | "createdAt" | "userId">) => void,
  editingQuery?: QueryConfig | null
) {
  const { userId } = useAuth()
  const [selectedTags, setSelectedTags] = useState<string[]>(editingQuery?.tags || [])
  const [domainInput, setDomainInput] = useState("")
  const [tagInput, setTagInput] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Use secure API client
  const { call: secureCall, loading: apiLoading, error: apiError } = useSecureApi({
    showErrorToast: true
  })

  const { analytics, fetchAnalytics } = useAnalyticsStore()
  
  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: editingQuery
      ? {
          name: editingQuery.name || "",
          query: editingQuery.query || "",
          category: editingQuery.category || "news",
          // ✅ Always provide arrays - never undefined
          tags: Array.isArray(editingQuery.tags) ? editingQuery.tags : [],
          filters: {
            numResults: editingQuery.filters?.numResults ?? 50,
            // ✅ Always provide arrays - never undefined
            includeDomains: Array.isArray(editingQuery.filters?.includeDomains) 
              ? editingQuery.filters.includeDomains 
              : [],
            excludeDomains: Array.isArray(editingQuery.filters?.excludeDomains) 
              ? editingQuery.filters.excludeDomains 
              : [],
            startDate: editingQuery.filters?.startDate,
            endDate: editingQuery.filters?.endDate,
          },
          schedule: {
            enabled: editingQuery.schedule?.enabled ?? false,
            frequency: editingQuery.schedule?.frequency ?? "daily",
          },
        }
      : {
          name: "",
          query: "",
          category: "news",
          filters: {
            numResults: 50,
            includeDomains: [], // ✅ Always array, never undefined
            excludeDomains: [], // ✅ Always array, never undefined
            startDate: undefined,
            endDate: undefined,
          },
          schedule: {
            enabled: false,
            frequency: "daily",
          },
          tags: [], // ✅ Always array, never undefined
        },
  })

  // Enhanced domain validation with better error handling
  const validateDomain = (domain: string): boolean => {
    if (!domain || typeof domain !== 'string') return false
    
    try {
      // Remove protocol if present and validate
      const cleanDomain = domain.replace(/^https?:\/\//, '').toLowerCase()
      
      // Basic domain validation regex
      const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/
      
      if (domainRegex.test(cleanDomain)) {
        return true
      }
      
      // Fallback: try URL constructor
      const url = domain.startsWith('http') ? new URL(domain) : new URL(`https://${domain}`)
      return url.hostname.includes('.')
    } catch {
      return false
    }
  }

  const handleDomainAdd = (domain: string, type: "include" | "exclude") => {
    const sanitizedDomain = sanitizeInput(domain).toLowerCase()
    
    if (!sanitizedDomain) return
    
    if (!validateDomain(sanitizedDomain)) {
      form.setError(`filters.${type === "include" ? "includeDomains" : "excludeDomains"}`, {
        type: 'manual',
        message: 'Invalid domain format'
      })
      return
    }

    const field = `filters.${type === "include" ? "includeDomains" : "excludeDomains"}` as const
    const current = form.getValues(field) // ✅ Now guaranteed to be array
    
    if (!current.includes(sanitizedDomain)) {
      form.setValue(field, [...current, sanitizedDomain])
      form.clearErrors(`filters.${type === "include" ? "includeDomains" : "excludeDomains"}`)
    }
    setDomainInput("")
  }

  const handleDomainRemove = (domain: string, type: "include" | "exclude") => {
    const field = `filters.${type === "include" ? "includeDomains" : "excludeDomains"}` as const
    const current = form.getValues(field) // ✅ Now guaranteed to be array
    form.setValue(field, current.filter((d) => d !== domain))
  }

  const handleTagSelect = (tag: string) => {
    const sanitizedTag = sanitizeInput(tag)
    
    if (!sanitizedTag || selectedTags.includes(sanitizedTag)) return
    
    if (selectedTags.length >= 10) {
      form.setError('tags', {
        type: 'manual',
        message: 'Maximum 10 tags allowed'
      })
      return
    }

    const newTags = [...selectedTags, sanitizedTag]
    setSelectedTags(newTags)
    form.setValue("tags", newTags)
    form.clearErrors('tags')
    setTagInput("")
  }

  const handleTagRemove = (tag: string) => {
    const newTags = selectedTags.filter((t) => t !== tag)
    setSelectedTags(newTags)
    form.setValue("tags", newTags)
    form.clearErrors('tags')
  }

  // Enhanced form submission with security
  const onFormSubmit = async (data: FormSchema) => {
    if (!userId) {
      form.setError('root', { message: 'Authentication required' })
      return
    }

    if (isSubmitting) return

    try {
      setIsSubmitting(true)
      
      // Sanitize all form data
      const sanitizedData = sanitizeObject(data)
      
      // Additional validation
      if (sanitizedData.filters.startDate && sanitizedData.filters.endDate) {
        const startDate = new Date(sanitizedData.filters.startDate)
        const endDate = new Date(sanitizedData.filters.endDate)
        
        if (startDate >= endDate) {
          form.setError('filters.endDate', {
            type: 'manual',
            message: 'End date must be after start date'
          })
          return
        }
      }

      const queryData: Omit<QueryConfig, "id" | "createdAt" | "userId"> = {
        ...sanitizedData,
        tags: selectedTags, // ✅ Always array
      }

      // Submit via callback
      await onSubmit(queryData)
      
      // Reset form on successful submission
      if (!editingQuery) {
        form.reset()
        setSelectedTags([])
        setDomainInput("")
        setTagInput("")
      }
      
    } catch (error) {
      console.error('Form submission error:', error)
      form.setError('root', {
        message: error instanceof Error ? error.message : 'Submission failed'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Watch for form changes and sanitize inputs
  const watchedName = form.watch('name')
  const watchedQuery = form.watch('query')

  useEffect(() => {
    if (watchedName && watchedName !== sanitizeInput(watchedName)) {
      form.setValue('name', sanitizeInput(watchedName))
    }
  }, [watchedName, form])

  useEffect(() => {
    if (watchedQuery && watchedQuery !== sanitizeInput(watchedQuery)) {
      form.setValue('query', sanitizeInput(watchedQuery))
    }
  }, [watchedQuery, form])

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
    isSubmitting,
    apiLoading,
    apiError,
    validateDomain,
  }
}

export { CATEGORY_MAP, CATEGORY_MAP_REVERSE } from "@/lib/category-map"