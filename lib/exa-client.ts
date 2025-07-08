import type { ExaSearchOptions, ExaSearchResult, ExaSearchResponse } from "./types"

export class ExaClient {
  private apiKey: string
  private baseUrl = "https://api.exa.ai"

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async search(options: ExaSearchOptions): Promise<ExaSearchResponse> {
    const startTime = Date.now()

    try {
     const requestBody = {
    query: options.query,
    numResults: options.numResults || 10,
    ...(options.category && { category: options.category }),
    ...(options.startDate && { start_published_date: options.startDate }),
    ...(options.endDate && { end_published_date: options.endDate }),
    ...(options.includeDomains?.length && { include_domains: options.includeDomains }),
    ...(options.excludeDomains?.length && { exclude_domains: options.excludeDomains }),
    summary: true,
}

const response = await fetch(`${this.baseUrl}/search`, {
    method: "POST",
    headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
    },
    body: JSON.stringify(requestBody),
})

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Exa API Error: ${response.status} - ${errorData.message || response.statusText}`)
      }

      const data = await response.json()
      const responseTime = (Date.now() - startTime) / 1000

      // Transform Exa API response to our format
      const results: ExaSearchResult[] = data.results?.map((result: any) => ({
        title: result.title || "Untitled",
        url: result.url,
        snippet: result.summary || result.text || "",
        score: result.score || 0,
        publishedDate: result.date,
        author: result.author,
      })) || []

      return {
        results,
        totalResults: data.totalResults || data.results?.length || 0,
        responseTime,
      }
    } catch (error) {
      console.error("Exa API Error:", error)
      throw error
    }
  }
}
