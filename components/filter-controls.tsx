"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Filter, X } from "lucide-react"
import type { QueryConfig } from "@/lib/types"

type QueryFrequency = QueryConfig["schedule"]["frequency"]

interface FilterState {
  tags: string[]
  frequency: QueryFrequency | ""
}

interface FilterControlsProps {
  filters: FilterState
  onFilterChange: (filters: FilterState) => void
}

// Available tags for filtering
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
  "HTML",
  "API",
  "GraphQL",
  "REST",
  "Database",
  "SQL",
  "NoSQL",
  "MongoDB",
  "PostgreSQL",
  "Performance",
  "SEO",
  "Accessibility",
  "Machine Learning",
  "AI",
  "Python",
] as const

export default function FilterControls({ filters, onFilterChange }: FilterControlsProps) {
  const [tagInput, setTagInput] = useState("")
  const [isExpanded, setIsExpanded] = useState(false)

  // Handle tag selection
  const handleTagSelect = (tag: string) => {
    if (!filters.tags.includes(tag)) {
      onFilterChange({
        ...filters,
        tags: [...filters.tags, tag],
      })
    }
    setTagInput("")
  }

  // Handle tag removal
  const handleTagRemove = (tag: string) => {
    onFilterChange({
      ...filters,
      tags: filters.tags.filter((t: string) => t !== tag),
    })
  }

  // Handle frequency change
  const handleFrequencyChange = (value: QueryFrequency | "") => {
    onFilterChange({
      ...filters,
      frequency: value,
    })
  }

  // Handle clearing all filters
  const handleClearFilters = () => {
    onFilterChange({
      tags: [],
      frequency: "",
    })
  }

  // Filter tags based on input
  const filteredTags = availableTags.filter(
    (tag: string) => tag.toLowerCase().includes(tagInput.toLowerCase()) && !filters.tags.includes(tag)
  )

  // Check if any filters are active
  const hasActiveFilters = filters.tags.length > 0 || filters.frequency !== ""

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setIsExpanded(!isExpanded)}>
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-1 rounded-full px-1 py-0">
              {filters.tags.length + (filters.frequency ? 1 : 0)}
            </Badge>
          )}
        </Button>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {isExpanded && (
        <div className="grid gap-4 p-4 border rounded-md bg-gray-50 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Filter by Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {filters.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-transparent"
                    onClick={() => handleTagRemove(tag)}
                  >
                    <X className="h-3 w-3" />
                    <span className="sr-only">Remove {tag}</span>
                  </Button>
                </Badge>
              ))}
            </div>
            <div className="relative">
              <Input placeholder="Search tags..." value={tagInput} onChange={(e) => setTagInput(e.target.value)} />
              {tagInput.length > 0 && (
                <div className="absolute z-10 w-full mt-1 max-h-40 overflow-auto bg-white border rounded-md shadow-lg">
                  {filteredTags.length > 0 ? (
                    filteredTags.map((tag) => (
                      <div
                        key={tag}
                        className="px-3 py-2 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleTagSelect(tag)}
                      >
                        {tag}
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-gray-500">No matching tags</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Filter by Frequency</label>
            <Select value={filters.frequency} onValueChange={handleFrequencyChange}>
              <SelectTrigger>
                <SelectValue placeholder="All frequencies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All frequencies</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  )
}
