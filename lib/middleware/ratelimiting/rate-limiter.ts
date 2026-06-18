// app/services/rate-limiter.ts
interface EnhancedRateLimitConfig {
  maxRequests: number
  windowMs: number
  keyGenerator?: (userId: string, endpoint: string) => string
  skipSuccessfulReqs?: boolean // For query runs that succeed
  skipIf?: (req: any) => boolean
  onLimitReached?: (userId: string, endpoint: string) => void
}

class EnhancedRateLimiter {
  private static requests = new Map<string, { 
    count: number
    successCount: number
    resetTime: number
    firstRequest: number
  }>()

  static async checkLimit(
    userId: string,
    endpoint: string,
    config: EnhancedRateLimitConfig
  ): Promise<{ 
    allowed: boolean
    resetTime?: number
    remaining?: number
    used?: number
  }> {
    const now = Date.now()
    const key = config.keyGenerator ? 
      config.keyGenerator(userId, endpoint) : 
      `${userId}:${endpoint}`

    const current = this.requests.get(key)

    if (!current || now > current.resetTime) {
      const newEntry = { 
        count: 1, 
        successCount: 0,
        resetTime: now + config.windowMs,
        firstRequest: now
      }
      this.requests.set(key, newEntry)
      
      return { 
        allowed: true, 
        remaining: config.maxRequests - 1,
        used: 1
      }
    }

    if (current.count >= config.maxRequests) {
      config.onLimitReached?.(userId, endpoint)
      return { 
        allowed: false, 
        resetTime: current.resetTime,
        remaining: 0,
        used: current.count
      }
    }

    current.count++
    return { 
      allowed: true,
      remaining: config.maxRequests - current.count,
      used: current.count
    }
  }

  // Track successful operations for dynamic rate limiting
  static recordSuccess(userId: string, endpoint: string) {
    const key = `${userId}:${endpoint}`
    const current = this.requests.get(key)
    if (current) {
      current.successCount++
    }
  }

  // Get user's rate limit status
  static getStatus(userId: string, endpoint: string) {
    const key = `${userId}:${endpoint}`
    const current = this.requests.get(key)
    if (!current) return null

    return {
      requests: current.count,
      successful: current.successCount,
      remaining: Math.max(0, Date.now() - current.resetTime),
      resetAt: new Date(current.resetTime)
    }
  }

  static cleanup() {
    const now = Date.now()
    let cleaned = 0
    for (const [key, value] of this.requests.entries()) {
      if (now > value.resetTime) {
        this.requests.delete(key)
        cleaned++
      }
    }
    console.log(`[RateLimiter] Cleaned ${cleaned} expired entries`)
  }
}

export { EnhancedRateLimiter as RateLimiter, type EnhancedRateLimitConfig as RateLimitConfig }
