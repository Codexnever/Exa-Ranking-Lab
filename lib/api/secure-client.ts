// app/lib/api/secure-client.ts - Development Version (No CSRF)
class ProductionSecureApiClient {
  private baseURL: string
  private retryCount = new Map<string, number>()
  private readonly MAX_RETRIES = 3

  constructor(baseURL: string = '/api') {
    // Remove trailing slash to prevent double slashes
    this.baseURL = baseURL.replace(/\/+$/, '')
    this.setupPerformanceMonitoring()
  }

  // Get Appwrite JWT from cookie
  private getSessionIdFromCookie(): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/(?:^|; )appwrite_jwt=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  // Centralized header creation
  private createHeaders(additionalHeaders?: HeadersInit): Headers {
    const headers = new Headers(additionalHeaders)
    
    headers.set('X-Requested-With', 'XMLHttpRequest')
    
    const sessionId = this.getSessionIdFromCookie();
    if (sessionId) {
      headers.set('X-Session-ID', sessionId);
      headers.set('Authorization', `Bearer ${sessionId}`);
    }
    
    return headers
  }

  private setupPerformanceMonitoring() {
    // Track API performance metrics
    if (typeof window !== 'undefined' && 'performance' in window) {
      window.addEventListener('beforeunload', () => {
        this.logPerformanceMetrics()
      })
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Improved URL construction to handle leading/trailing slashes
    let url: string
    if (endpoint.startsWith('http')) {
      // Absolute URL
      url = endpoint
    } else {
      // Relative URL - ensure proper concatenation
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
      url = `${this.baseURL}${cleanEndpoint}`
    }
    
    const method = options.method || 'GET'
    const requestKey = `${method}:${endpoint}`
    
    // Check retry count
    const currentRetries = this.retryCount.get(requestKey) || 0
    if (currentRetries >= this.MAX_RETRIES) {
      throw new Error('Maximum retry attempts exceeded')
    }

    const startTime = Date.now()
    
    try {
      // Use centralized header creation
      const headers = this.createHeaders(options.headers)

      // Set content type for JSON requests
      if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
      }

      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include'
      })

      // Handle authentication errors
      if (response.status === 401) {
        console.warn('[SecureClient] Authentication failed, redirecting to login')
        if (typeof window !== 'undefined') {
          window.location.href = '/auth'
        }
        throw new Error('Authentication required')
      }

      // Handle authorization errors (simplified - no CSRF retry logic)
      if (response.status === 403) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Access forbidden')
      }

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After')
        const remaining = response.headers.get('X-RateLimit-Remaining')
        
        console.warn(`[SecureClient] Rate limited. Retry after: ${retryAfter}s, Remaining: ${remaining}`)
        
        const waitTime = retryAfter ? `${retryAfter} seconds` : 'a moment'
        throw new Error(`Rate limit exceeded. Please wait ${waitTime} and try again.`)
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      // Clear retry count on success
      this.retryCount.delete(requestKey)

      // Log successful request performance
      const duration = Date.now() - startTime
      if (duration > 2000) { // Log slow requests
        console.warn(`[SecureClient] Slow request: ${method} ${endpoint} took ${duration}ms`)
      }

      const contentType = response.headers.get('Content-Type')
      if (contentType?.includes('application/json')) {
        return response.json()
      }
      
      return response.text() as any

    } catch (error) {
      // Log error for monitoring
      console.error(`[SecureClient] Request failed: ${method} ${endpoint}`, error)
      
      // Don't retry non-recoverable errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network error. Please check your connection.')
      }
      
      throw error
    }
  }

  private logPerformanceMetrics() {
    const metrics = {
      sessionId: this.getSessionIdFromCookie(),
      timestamp: new Date().toISOString()
    }
    
    console.log('[SecureClient] Performance metrics:', metrics)
  }

  // Public API methods
  async get<T>(endpoint: string): Promise<T> {
    return this.makeRequest<T>(endpoint, { method: 'GET' })
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.makeRequest<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    })
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.makeRequest<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined
    })
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.makeRequest<T>(endpoint, { method: 'DELETE' })
  }

  // Get client status for debugging
  getStatus() {
    return {
      sessionId: this.getSessionIdFromCookie(),
      activeRetries: Array.from(this.retryCount.entries())
    }
  }

  // Cleanup method for proper resource management
  cleanup(): void {
    this.retryCount.clear()
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.logPerformanceMetrics)
    }
    console.log('[SecureClient] Resources cleaned up')
  }
}

export const apiClient = new ProductionSecureApiClient()
