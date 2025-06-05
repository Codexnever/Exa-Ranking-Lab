"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Switch } from "@/components/ui/switch"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Badge } from "@/components/ui/badge"
import { X, Plus } from "lucide-react"
import type { QueryConfig } from "@/lib/types"
import { useAuth } from "@/contexts/auth-context"

// Available tags for selection
const availableTags = [
  "JavaScript",
  "TypeScript",
  "React",
  "Next.js",
  "Vue",
  "Angular",
  "Svelte",
  "Node.js",
  "Express",
  "Frontend",
  "Backend",
  "CSS",
]

const QueryCategory = z.enum(["web", "news", "research", "code"])
const QueryFrequency = z.enum(["hourly", "daily", "weekly"])

type QueryCategory = z.infer<typeof QueryCategory>
type QueryFrequency = z.infer<typeof QueryFrequency>

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

interface QueryFormProps {
  onSubmit: (data: Omit<QueryConfig, "id" | "createdAt" | "userId">) => void
}

export function QueryForm({ onSubmit }: QueryFormProps) {
  const { userId } = useAuth()
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [domainInput, setDomainInput] = useState("")
  const [tagInput, setTagInput] = useState("")

  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      query: "",
      category: "web",
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

  // Filtered tag suggestions
  const tagSuggestions = availableTags.filter(
    (tag) => tag.toLowerCase().includes(tagInput.toLowerCase()) && !selectedTags.includes(tag)
  )

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onFormSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Query Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Enter a name for your query" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="query"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Search Query</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Enter your search query" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(Object.keys(QueryCategory.enum) as Array<keyof typeof QueryCategory.enum>).map(
                    (category) => (
                      <SelectItem key={category} value={category}>
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="filters.numResults"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Number of Results</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  {...field}
                  onChange={(e) => field.onChange(parseInt(e.target.value))}
                  min={1}
                  max={100}
                />
              </FormControl>
              <FormDescription>Choose between 1 and 100 results</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-4">
          <FormLabel>Include Domains</FormLabel>
          <div className="flex gap-2">
            <Input
              placeholder="domain.com"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleDomainAdd(domainInput, "include")
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDomainAdd(domainInput, "include")}
            >
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {form.watch("filters.includeDomains")?.map((domain) => (
              <Badge key={domain} variant="secondary">
                {domain}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 ml-2"
                  onClick={() => handleDomainRemove(domain, "include")}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <FormLabel>Exclude Domains</FormLabel>
          <div className="flex gap-2">
            <Input
              placeholder="domain.com"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleDomainAdd(domainInput, "exclude")
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDomainAdd(domainInput, "exclude")}
            >
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {form.watch("filters.excludeDomains")?.map((domain) => (
              <Badge key={domain} variant="secondary">
                {domain}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 ml-2"
                  onClick={() => handleDomainRemove(domain, "exclude")}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        </div>

        <FormField
          control={form.control}
          name="schedule.enabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Schedule Query</FormLabel>
                <FormDescription>
                  Enable automated execution of this query
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        {form.watch("schedule.enabled") && (
          <FormField
            control={form.control}
            name="schedule.frequency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Frequency</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(Object.keys(QueryFrequency.enum) as Array<keyof typeof QueryFrequency.enum>).map(
                      (frequency) => (
                        <SelectItem key={frequency} value={frequency}>
                          {frequency.charAt(0).toUpperCase() + frequency.slice(1)}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="space-y-4">
          <FormLabel>Tags</FormLabel>
          <div className="flex gap-2">
            <Input
              placeholder="Search tags..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
            />
          </div>
          {tagInput.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tagSuggestions.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => handleTagSelect(tag)}
                >
                  {tag}
                  <Plus className="h-3 w-3 ml-1" />
                </Badge>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {selectedTags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 ml-2"
                  onClick={() => handleTagRemove(tag)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        </div>

        <Button type="submit">Save Query</Button>
      </form>
    </Form>
  )
}
