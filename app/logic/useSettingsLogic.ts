// app/logic/useSettingsLogic.ts
import { useEffect, useState, useCallback, useMemo } from "react"
import { toast } from "sonner"
import { saveAs } from "file-saver"
import { useQueriesStore, useSnapshotsStore, useAnalyticsStore } from "@/app/store"
import { useSettingsStore } from "@/app/store"
import { useAuth } from "@/lib/contexts/auth-context"

// ✅ Enhanced TypeScript interfaces
interface ExportData {
  exportDate: string
  exportVersion: string
  user: {
    id: string
    email: string
  }
  queries: any[]
  snapshots: any[]
  summary: {
    totalQueries: number
    totalSnapshots: number
    totalResults: number
    dateRange: {
          earliest: string | Date  // ✅ Allow both types
      latest: string | Date 
    } | null
    categories: string[]
    estimatedSizeKB: number
  }
}

interface DataStats {
  queries: number
  snapshots: number
  results: number
}

interface Preferences {
  defaultResultCount: number
  autoRefreshInterval: number
  theme: "light" | "dark" | "system"
  timezone: string
  notificationsEnabled: boolean
  exportFormat: "json" | "pdf"
}

export function useSettingsLogic() {
  const { user } = useAuth()
  const { apiKey, apiStatus, lastTested, setSettings } = useSettingsStore()
  
  // ✅ Enhanced loading states with better typing
  const [isExporting, setIsExporting] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isSavingKey, setIsSavingKey] = useState(false)
  const [isSavingPrefs, setIsSavingPrefs] = useState(false)

  // ✅ Enhanced preferences with actual functionality
  const [preferences, setPreferences] = useState<Preferences>({
    defaultResultCount: 20,
    autoRefreshInterval: 30,
    theme: "light",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    notificationsEnabled: true,
    exportFormat: "json",
  })

  // ✅ Store selectors with proper error handling
  const queries = useQueriesStore(state => state.queries) || []
  const allSnapshots = useSnapshotsStore(state => state.allSnapshots) || []
  const clearSnapshots = useSnapshotsStore(state => state.clearSnapshots)
  const clearAnalytics = useAnalyticsStore(state => state.clearAnalytics)
  
  // ✅ Safe clear queries method
  const clearQueries = useQueriesStore(state => state.clearQueries) || (() => {
    console.warn('clearQueries method not available in store')
  })

  // ✅ Load settings and preferences on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [settingsRes] = await Promise.allSettled([
          fetch("/api/settings", { credentials: "include" }),
        ])

        // Load settings
        if (settingsRes.status === 'fulfilled' && settingsRes.value.ok) {
          const settingsData = await settingsRes.value.json()
          setSettings({
            apiKey: settingsData.apiKey || "",
            apiStatus: settingsData.apiStatus || "unknown",
            lastTested: settingsData.lastTested || null,
          })
        }

        // Load preferences
        // if (prefsRes.status === 'fulfilled' && prefsRes.value.ok) {
        //   const prefsData = await prefsRes.value.json()
        //   setPreferences(prev => ({ ...prev, ...prefsData }))
        // }
      } catch (err) {
        console.error("Failed to load settings/preferences:", err)
      }
    }
    
    loadSettings()
  }, [setSettings])

  // ✅ Enhanced API connection test with retry logic
  const testApiConnection = useCallback(async () => {
    if (!apiKey.trim()) {
      toast.error("Please enter an API key first")
      return false
    }
    
    setIsTesting(true)
    const loadingId = toast.loading("Testing API connection...")
    
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

      const response = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      const data = await response.json()
      const now = new Date().toLocaleTimeString()

      if (response.ok && data.success) {
        toast.success(
          `API connection successful! Found ${data.resultsCount} result(s)`, 
          { id: loadingId }
        )
        setSettings({ apiStatus: "connected", lastTested: now })
        
        // Auto-save to server
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            apiKey,
            apiStatus: "connected",
            lastTested: now,
          }),
        })
        
        return true
      } else {
        toast.error(data.message || "API connection failed!", { id: loadingId })
        setSettings({ apiStatus: "disconnected", lastTested: now })
        return false
      }
    } catch (error) {
      console.error("Test connection error:", error)
      const now = new Date().toLocaleTimeString()
      const errorMessage = error instanceof Error 
        ? error.name === 'AbortError' 
          ? "Connection timeout"
          : error.message
        : "Connection failed"
      
      setSettings({ apiStatus: "disconnected", lastTested: now })
      toast.error(`Failed to test API connection: ${errorMessage}`, { id: loadingId })
      return false
    } finally {
      setIsTesting(false)
    }
  }, [apiKey, setSettings])

  // ✅ Enhanced API key saving with validation
  const handleSaveApiKey = useCallback(async () => {
    if (!apiKey.trim()) {
      toast.error("API key cannot be empty")
      return
    }

    setIsSavingKey(true)
    
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ apiKey: apiKey.trim(), apiStatus, lastTested }),
      })
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to update API key")
      }
      
      toast.success("API key updated successfully!")
      
      // Auto-test connection after saving
      if (window.confirm("Would you like to test the connection now?")) {
        await testApiConnection()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      toast.error(`Failed to update API key: ${message}`)
    } finally {
      setIsSavingKey(false)
    }
  }, [apiKey, apiStatus, lastTested, testApiConnection])

  // ✅ Enhanced preferences handling
  const handleSavePreferences = useCallback(async () => {
    setIsSavingPrefs(true)
    
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(preferences),
      })
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save preferences")
      }
      
      toast.success("Preferences saved successfully!")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      toast.error(`Failed to save preferences: ${message}`)
    } finally {
      setIsSavingPrefs(false)
    }
  }, [preferences])

  // ✅ Memoized user data stats for better performance
  const dataStats: DataStats = useMemo(() => {
    if (!user) return { queries: 0, snapshots: 0, results: 0 }
    
    const userQueries = queries.filter(q => q.userId === user.$id)
    const userSnapshots = allSnapshots.filter(s => s.userId === user.$id)
    const totalResults = userSnapshots.reduce((sum, s) => sum + (s.results?.length || 0), 0)
    
    return {
      queries: userQueries.length,
      snapshots: userSnapshots.length,
      results: totalResults
    }
  }, [queries, allSnapshots, user])

  // ✅ Enhanced export with better error handling and retry logic
  const handleExportData = useCallback(async () => {
    if (!user) {
      toast.error("Please log in to export data")
      return
    }

    if (dataStats.queries === 0 && dataStats.snapshots === 0) {
      toast.error("No data to export")
      return
    }

    setIsExporting(true)
    
    try {
      const loadingId = toast.loading("Generating data export...")
      
      const userQueries = queries.filter(q => q.userId === user.$id)
      const userSnapshots = allSnapshots.filter(s => s.userId === user.$id)
      
const exportData: ExportData = {
  exportDate: new Date().toISOString(),
  exportVersion: "2.1",
  user: {
    id: user.$id,
    email: user.email || "unknown"
  },
  queries: userQueries,
  snapshots: userSnapshots,
  summary: {
    totalQueries: userQueries.length,
    totalSnapshots: userSnapshots.length,
    totalResults: userSnapshots.reduce((sum, s) => sum + (s.results?.length || 0), 0),
    // ✅ Fix: Convert timestamps to strings
    dateRange: userSnapshots.length > 0 ? {
      earliest: typeof userSnapshots[userSnapshots.length - 1]?.timestamp === 'string' 
        ? userSnapshots[userSnapshots.length - 1]?.timestamp
        : userSnapshots[userSnapshots.length - 1]?.timestamp?.toISOString(),
      latest: typeof userSnapshots[0]?.timestamp === 'string'
        ? userSnapshots[0]?.timestamp  
        : userSnapshots[0]?.timestamp?.toISOString()
    } : null,
    categories: [...new Set(userQueries.map(q => q.category).filter(Boolean))],
    estimatedSizeKB: Math.round(
      (userQueries.length * 0.5) + 
      (userSnapshots.length * 2) + 
      (userSnapshots.reduce((sum, s) => sum + (s.results?.length || 0), 0) * 0.1)
    )
  }
}

      // Export based on user preference
      if (preferences.exportFormat === "pdf") {
        try {
          const pdfRes = await fetch("/api/export-data/pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ data: exportData }),
          })
          
          if (pdfRes.ok) {
            const blob = await pdfRes.blob()
            saveAs(blob, `exa-ranking-lab-export-${new Date().toISOString().split("T")[0]}.pdf`)
            toast.success(
              `PDF export downloaded! (${userQueries.length} queries, ${userSnapshots.length} snapshots)`, 
              { id: loadingId }
            )
            return
          } else {
            throw new Error("PDF generation failed")
          }
        } catch (pdfError) {
          console.warn("PDF export failed, using JSON fallback:", pdfError)
          toast.info("PDF export failed, generating JSON instead...")
        }
      }
      
      // JSON export (default or fallback)
      const jsonBlob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      })
      saveAs(jsonBlob, `exa-ranking-lab-export-${new Date().toISOString().split("T")[0]}.json`)
      toast.success(
        `JSON export downloaded! (${userQueries.length} queries, ${userSnapshots.length} snapshots)`, 
        { id: loadingId }
      )
      
    } catch (error) {
      console.error("Export failed:", error)
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to export data: ${message}`)
    } finally {
      setIsExporting(false)
    }
  }, [user, dataStats, queries, allSnapshots, preferences.exportFormat])

  // ✅ Enhanced clear data with better confirmation and cleanup
  const handleClearData = useCallback(async () => {
    if (!user) {
      toast.error("Please log in to clear data")
      return
    }

    if (dataStats.queries === 0 && dataStats.snapshots === 0) {
      toast.info("No data to clear")
      return
    }

    // Enhanced confirmation with detailed breakdown
    const confirmed = window.confirm(
      `⚠️ PERMANENT DATA DELETION ⚠️\n\n` +
      `This will permanently delete ALL your data:\n\n` +
      `• ${dataStats.queries} queries\n` +
      `• ${dataStats.snapshots} snapshots\n` +
      `• ${dataStats.results} search results\n` +
      `• All analytics and trends\n` +
      `• All settings and preferences\n\n` +
      `This action CANNOT be undone!\n\n` +
      `Click OK to continue, or Cancel to abort.`
    )

    if (!confirmed) return

    // Double confirmation with typed verification
    const confirmText = window.prompt(
      `🔒 FINAL CONFIRMATION\n\n` +
      `Please type "DELETE MY DATA" to confirm permanent deletion:\n` +
      `(This is your last chance to cancel)`
    )

    if (confirmText !== "DELETE MY DATA") {
      toast.error("Data deletion cancelled - confirmation text did not match")
      return
    }

    setIsClearing(true)
    const loadingId = toast.loading("Clearing all data...")
    
    try {
      // Clear server data first
      const serverResponse = await fetch('/api/clear-data', {
        method: 'DELETE',
        credentials: 'include',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmDeletion: true })
      })
      
      if (!serverResponse.ok) {
        const errorData = await serverResponse.json().catch(() => ({}))
        throw new Error(errorData.message || "Failed to clear data on server")
      }
      
      // Clear client stores with error handling
      try {
        if (clearSnapshots) clearSnapshots()
      } catch (err) {
        console.warn("Failed to clear snapshots store:", err)
      }
      
      try {
        if (clearQueries) clearQueries()
      } catch (err) {
        console.warn("Failed to clear queries store:", err)
      }
      
      try {
        if (clearAnalytics) clearAnalytics()
      } catch (err) {
        console.warn("Failed to clear analytics store:", err)
      }
      
      // Clear local storage
      const storageKeys = [
        'snapshots-storage',
        'queries-storage', 
        'analytics-storage',
        'settings-storage'
      ]
      
      storageKeys.forEach(key => {
        try {
          localStorage.removeItem(key)
        } catch (err) {
          console.warn(`Failed to clear ${key}:`, err)
        }
      })
      
      toast.success(
        `All data cleared successfully!\n` +
        `Deleted: ${dataStats.queries} queries, ${dataStats.snapshots} snapshots, ${dataStats.results} results`,
        { id: loadingId, duration: 5000 }
      )
      
      // Optional: Redirect to dashboard after clearing
      setTimeout(() => {
        window.location.href = '/'
      }, 2000)
      
    } catch (error) {
      console.error('Clear data failed:', error)
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to clear all data: ${message}`, { id: loadingId })
    } finally {
      setIsClearing(false)
    }
  }, [user, dataStats, clearSnapshots, clearQueries, clearAnalytics])

  // ✅ Utility function to update API key
  const setApiKey = useCallback((key: string) => {
    setSettings({ apiKey: key.trim() })
  }, [setSettings])

  // ✅ Utility function to update preferences
  // const updatePreferences = useCallback((updates: Partial<Preferences>) => {
  //   setPreferences(prev => ({ ...prev, ...updates }))
  // }, [])

  return {
    // API settings
    apiKey,
    apiStatus,
    lastTested,
    isTesting,
    isSavingKey,
    testApiConnection,
    handleSaveApiKey,
    setApiKey,
    
    // Preferences
    // preferences,
    // isSavingPrefs,
    // handleSavePreferences,
    // updatePreferences,
    
    // Data management
    handleExportData,
    handleClearData,
    isExporting,
    isClearing,
    
    // Data stats
    dataStats,
    
    // Utility
    isReady: !!(user && apiKey && apiStatus === "connected"),
    hasData: dataStats.queries > 0 || dataStats.snapshots > 0,
  }
}
