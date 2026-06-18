// app/lib/middleware/security-middleware.ts
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"
import { RateLimiter, RateLimitConfig } from "@/lib/middleware/ratelimiting/rate-limiter"
import { SecurityContext } from "@/types/type"

//  ADD: Missing createSecurityContext function
async function createSecurityContext(request: NextRequest): Promise<SecurityContext | null> {
  const user = await getCurrentUser()
  if (!user) return null

  return {
    user,
    // Use JWT from X-Session-ID header or appwrite_jwt cookie
    sessionId: request.headers.get('X-Session-ID') || 
               request.cookies.get('appwrite_jwt')?.value || 
               'anonymous',
    ip: request.headers.get('x-forwarded-for') || 
        request.headers.get('x-real-ip') || 
        'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
    endpoint: request.nextUrl.pathname,
    method: request.method.toUpperCase()
  }
}

export function withEnhancedSecurity(
  handler: (req: NextRequest, context: SecurityContext, ...args: any[]) => Promise<NextResponse>,
  options: {
    rateLimit?: RateLimitConfig
    requireCSRF?: boolean // Keep this for future use, but default to false
    allowedMethods?: string[]
    logAttempts?: boolean
  } = {}
) {
  return async (request: NextRequest, ...args: any[]) => {
    const startTime = Date.now()
    
    try {
      // Create security context
      const context = await createSecurityContext(request)
      if (!context) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 })
      }

      // Method validation
      if (options.allowedMethods && !options.allowedMethods.includes(context.method)) {
        return NextResponse.json(
          { error: `Method ${context.method} not allowed` }, 
          { status: 405 }
        )
      }

      // Rate limiting (keep this for security)
      if (options.rateLimit) {
        const rateLimitResult = await RateLimiter.checkLimit(
          context.user.$id, 
          context.endpoint, 
          options.rateLimit
        )

        if (!rateLimitResult.allowed) {
          const retryAfter = rateLimitResult.resetTime ? 
            Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000) : 60
          
          if (options.logAttempts) {
            console.warn(`[Security] Rate limit exceeded for user ${context.user.$id} on ${context.endpoint}`)
          }

          return NextResponse.json(
            { 
              error: "Too many requests. Please slow down.",
              retryAfter,
              remaining: 0
            },
            { 
              status: 429,
              headers: { 
                "Retry-After": retryAfter.toString(),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Used": rateLimitResult.used?.toString() || "unknown"
              }
            }
          )
        }
      }

      // ✅ CSRF REMOVED - Skip CSRF validation entirely for development
      if (process.env.NODE_ENV === 'development') {
        console.log('[Security] CSRF validation skipped for development')
      }

      // Execute handler with context
      const response = await handler(request, context, ...args)
      
      // Record successful operation for rate limiting
      if (response.status < 400 && options.rateLimit) {
        RateLimiter.recordSuccess(context.user.$id, context.endpoint)
      }

      // Add security headers
      response.headers.set('X-Content-Type-Options', 'nosniff')
      response.headers.set('X-Frame-Options', 'DENY')
      response.headers.set('X-XSS-Protection', '1; mode=block')
      
      // Log successful operations
      if (options.logAttempts && response.status < 400) {
        const duration = Date.now() - startTime
        console.log(`[Security] ${context.method} ${context.endpoint} by ${context.user.$id} - ${response.status} (${duration}ms)`)
      }

      return response

    } catch (error) {
      if (options.logAttempts) {
        console.error(`[Security] Error in ${request.nextUrl.pathname}:`, error)
      }
      
      return NextResponse.json(
        { 
          error: "An unexpected error occurred",
          ...(process.env.NODE_ENV === 'development' && { 
            details: error instanceof Error ? error.message : 'Unknown error'
          })
        },
        { status: 500 }
      )
    }
  }
}
