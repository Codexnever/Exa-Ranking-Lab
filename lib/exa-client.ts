interface ExaSearchOptions {
  query: string
  category?: "company" | "research paper" | "news" | "pdf" | "github" | "tweet" | "personal site" | "linkedin profile" | "financial report"
  includeDomains?: string[]
  excludeDomains?: string[]
  startDate?: string
  endDate?: string
  numResults?: number
}

interface ExaSearchResult {
  title: string
  url: string
  snippet: string
  score: number
  publishedDate?: string
  author?: string
}

interface ExaSearchResponse {
  results: ExaSearchResult[]
  totalResults: number
  responseTime: number
}

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
    numResults: options.numResults || 10,  // ✅ Fixed from 'size'
    ...(options.category && { category: options.category }),  // ✅ Correct
    ...(options.startDate && { start_published_date: options.startDate }),  // ✅ Fixed from 'dateStart'
    ...(options.endDate && { end_published_date: options.endDate }),  // ✅ Fixed from 'dateEnd'
    ...(options.includeDomains?.length && { include_domains: options.includeDomains }),  // ✅ Fixed from 'domains'
    ...(options.excludeDomains?.length && { exclude_domains: options.excludeDomains }),  // ✅ Already correct
    summary: true,
}

// console.log('Checking Request numResults from Exa client:', options.numResults)

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

  async getSimilar(url: string, numResults = 10): Promise<ExaSearchResponse> {
    const startTime = Date.now()

    try {
      const requestBody = {
        url,
        size: numResults,
        summary: true
      }

      const response = await fetch(`${this.baseUrl}/findSimilar`, {
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
