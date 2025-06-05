"use client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { AlertCircle, CheckCircle, Clock, RefreshCw, Zap } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface QueryExecutionStatusProps {
  queryId: string
  queryName: string
  status: "idle" | "running" | "success" | "error"
  progress?: number
  error?: string
  onRetry?: () => void
  onCancel?: () => void
  results?: {
    totalResults: number
    responseTime: number
    timestamp: Date
  }
}

export default function QueryExecutionStatus({
  queryId,
  queryName,
  status,
  progress = 0,
  error,
  onRetry,
  onCancel,
  results,
}: QueryExecutionStatusProps) {
  const getStatusIcon = () => {
    switch (status) {
      case "running":
        return <Clock className="w-4 h-4 text-blue-500 animate-spin" />
      case "success":
        return <CheckCircle className="w-4 h-4 text-emerald-500" />
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <Zap className="w-4 h-4 text-gray-400" />
    }
  }

  const getStatusBadge = () => {
    switch (status) {
      case "running":
        return <Badge variant="secondary">Running</Badge>
      case "success":
        return <Badge variant="default">Completed</Badge>
      case "error":
        return <Badge variant="destructive">Failed</Badge>
      default:
        return <Badge variant="outline">Ready</Badge>
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <CardTitle className="text-lg">{queryName}</CardTitle>
          </div>
          {getStatusBadge()}
        </div>
        <CardDescription>Query ID: {queryId}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "running" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Executing query...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="w-full" />
            {onCancel && (
              <Button variant="outline" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        )}

        {status === "success" && results && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-emerald-600">{results.totalResults}</div>
                <div className="text-xs text-gray-500">Results</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">{results.responseTime.toFixed(1)}s</div>
                <div className="text-xs text-gray-500">Response Time</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {new Date(results.timestamp).toLocaleTimeString()}
                </div>
                <div className="text-xs text-gray-500">Completed</div>
              </div>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-3">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error || "An unknown error occurred"}</AlertDescription>
            </Alert>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry} className="w-full">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry Query
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
