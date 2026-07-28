// components/ui/EmbeddingModeIndicator.tsx
"use client"

import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Brain, Zap, AlertTriangle, Database } from "lucide-react"
import type { EmbeddingMode } from "@/app/services/EmbeddingService"

interface EmbeddingModeIndicatorProps {
  mode:        EmbeddingMode
  cacheHitRate?: number   // 0.0 – 1.0
  persistentCacheSize?: number
  compact?:    boolean    // smaller version for Sidebar
}

const MODE_CONFIG: Record<EmbeddingMode, {
  label:    string
  detail:   string
  color:    string
  bgColor:  string
  icon:     typeof Brain
  warning?: string
}> = {
  gemini: {
    label:   "Gemini",
    detail:  "Using gemini-embedding-2-preview (primary model)",
    color:   "text-purple-700",
    bgColor: "bg-purple-50",
    icon:    Brain,
  },
  openai: {
  label: "OpenAI",
  detail: "OpenAI unavailable — using local OpenAI fallback",
  color: "text-blue-700",
  bgColor: "bg-blue-50",
  icon: Zap,
  warning:
    "Primary embedding model (Gemini) is unavailable. Semantic analysis is running on the OpenAI fallback.",
},
  "position-only": {
    label:   "Position Only",
    detail:  "Both AI providers unavailable — semantic analysis disabled",
    color:   "text-amber-700",
    bgColor: "bg-amber-50",
    icon:    AlertTriangle,
    warning: "All embedding providers are unavailable. Drift is being calculated from position changes only — semantic content analysis is disabled until providers recover.",
  },
}

export function EmbeddingModeIndicator({
  mode,
  cacheHitRate,
  persistentCacheSize,
  compact = false,
}: EmbeddingModeIndicatorProps) {
  const config  = MODE_CONFIG[mode] ?? MODE_CONFIG["gemini"]
  const ModeIcon = config.icon
  const hitPct  = typeof cacheHitRate === "number" ? Math.round(cacheHitRate * 100) : null

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${config.bgColor} ${config.color} cursor-default`}>
              <ModeIcon className="h-3 w-3" />
              <span className="font-medium">{config.label}</span>
              {hitPct !== null && (
                <span className="text-gray-500">· {hitPct}% cache</span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            <p className="text-xs">{config.detail}</p>
            {config.warning && (
              <p className="text-xs text-amber-600 mt-1">{config.warning}</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className={`p-3 rounded-lg border ${config.bgColor}`}
      style={{ borderColor: config.color.replace("text-", "").replace("-700", "-200") }}>
      <div className="flex items-center gap-2 mb-2">
        <ModeIcon className={`h-4 w-4 ${config.color}`} />
        <span className={`text-sm font-medium ${config.color}`}>
          Embedding: {config.label}
        </span>
        {mode === "position-only" && (
          <Badge variant="destructive" className="text-xs ml-auto">
            Degraded
          </Badge>
        )}
        {mode === "openai" && (
          <Badge variant="secondary" className="text-xs ml-auto bg-blue-100 text-blue-700">
            Fallback
          </Badge>
        )}
      </div>

      <p className="text-xs text-gray-600 mb-2">{config.detail}</p>

      {config.warning && (
        <div className="flex items-start gap-1.5 p-2 bg-white/70 rounded text-xs text-amber-700 mb-2">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>{config.warning}</span>
        </div>
      )}

      {/* Cache stats */}
      {(hitPct !== null || persistentCacheSize != null) && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          {hitPct !== null && (
            <div className="bg-white/60 rounded px-2 py-1 text-xs">
              <div className="flex items-center gap-1">
                <Database className="h-3 w-3 text-green-600" />
                <span className="font-medium">{hitPct}%</span>
              </div>
              <div className="text-gray-500">Cache hit rate</div>
            </div>
          )}
          {persistentCacheSize != null && (
            <div className="bg-white/60 rounded px-2 py-1 text-xs">
              <div className="flex items-center gap-1">
                <Database className="h-3 w-3 text-blue-600" />
                <span className="font-medium">{persistentCacheSize.toLocaleString()}</span>
              </div>
              <div className="text-gray-500">Cached vectors</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}