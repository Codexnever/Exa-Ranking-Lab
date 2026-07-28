
"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Shield } from 'lucide-react'
import { apiClient } from '@/lib/api/secure-client'

export function SecurityMonitor() {
  const [securityStatus, setSecurityStatus] = useState({
    csrfToken: false,
    rateLimit: { remaining: 0, used: 0 },
    sessionHealth: 'unknown',
    lastCheck: null as Date | null
  })

  useEffect(() => {
    const checkSecurityStatus = async () => {
      try {
        // Get client status
        const clientStatus = apiClient.getStatus()
        
        // Check CSRF token status
        const csrfValid = clientStatus.hasCSRFToken && 
                         clientStatus.tokenExpires > Date.now()

        setSecurityStatus({
          csrfToken: csrfValid,
          rateLimit: { remaining: 10, used: 0 }, // Would come from API
          sessionHealth: clientStatus.sessionId ? 'active' : 'inactive',
          lastCheck: new Date()
        })
      } catch (error) {
        console.error('Security status check failed:', error)
      }
    }

    checkSecurityStatus()
    const interval = setInterval(checkSecurityStatus, 30000) // Check every 30s

    return () => clearInterval(interval)
  }, [])

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Security Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">CSRF Protection</span>
            <Badge variant={securityStatus.csrfToken ? "default" : "destructive"}>
              {securityStatus.csrfToken ? "Active" : "Inactive"}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Session Status</span>
            <Badge variant={securityStatus.sessionHealth === 'active' ? "default" : "secondary"}>
              {securityStatus.sessionHealth}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Rate Limit</span>
            <Badge variant="outline">
              {securityStatus.rateLimit.remaining} remaining
            </Badge>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Last Check</span>
            <span className="text-xs text-gray-500">
              {securityStatus.lastCheck?.toLocaleTimeString() || 'Never'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
