import { cache, useEffect } from "react"
import { toast } from "sonner"
import { saveAs } from "file-saver"
import { useQueriesStore, useSnapshotsStore, useAnalyticsStore } from "@/app/store"
import { useSettingsStore } from "@/app/store"

export function useSettingsLogic() {
  const { apiKey, apiStatus, lastTested, setSettings } = useSettingsStore()

  useEffect(() => {
    cache(async () => {
      try {
        const res = await fetch("/api/settings", { credentials: "include" })
        if (!res.ok) throw new Error("Failed to load settings")
        const data = await res.json()
        setSettings({
          apiKey: data.apiKey || "",
          apiStatus: data.apiStatus || "unknown",
          lastTested: data.lastTested || null,
        })
      } catch (err) {
        console.error("Failed to load settings:", err)
      }
    })()
  }, [setSettings])

  const testApiConnection = cache(async () => {
    if (!apiKey.trim()) {
      toast.error("Please enter an API key first")
      return
    }
    const loadingId = toast.loading("Testing API connection...")
    try {
      const response = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      })
      const data = await response.json()
      const now = new Date().toLocaleTimeString()

      if (response.ok && data.success) {
        toast.success(`API connection successful! Found ${data.resultsCount} result(s)`, { id: loadingId })
        setSettings({ apiStatus: "connected", lastTested: now })
      } else {
        toast.error(data.message || "API connection failed!", { id: loadingId })
        setSettings({ apiStatus: "disconnected", lastTested: now })
      }

      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          apiKey,
          apiStatus: response.ok && data.success ? "connected" : "disconnected",
          lastTested: now,
        }),
      })
    } catch (error) {
      console.error("Test connection error:", error)
      const now = new Date().toLocaleTimeString()
      setSettings({ apiStatus: "disconnected", lastTested: now })
      toast.error("Failed to test API connection", { id: loadingId })
    }
  })

  const handleSaveApiKey = async () => {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ apiKey, apiStatus, lastTested }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to update API key")
      }
      toast.success("API key updated successfully!")
    } catch (err) {
      toast.error("Failed to update API key: " + (err instanceof Error ? err.message : "Unknown error"))
    }
  }

  // Preferences logic (Later expand to include more settings)
  const preferences = {
    defaultResultCount: 20,
    autoRefreshInterval: 30,
    theme: "light",
    timezone: "UTC",
  }

  const handleSavePreferences = () => {
    toast.success("Preferences saved!")
  }

  // Data management logic
  const { clearAnalytics } = useAnalyticsStore()
  const setQueriesStore = useQueriesStore((state) => state)
  const setSnapshotsStore = useSnapshotsStore((state) => state)

  const handleExportData = async () => {
    try {
      const load = toast.loading("Generating data export PDF...")
      const res = await fetch("/api/export-data?type=all")
      if (!res.ok) throw new Error("Failed to fetch export data")
      const { data } = await res.json()
      const pdfRes = await fetch("/api/export-data/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      })
      if (!pdfRes.ok) throw new Error("Failed to generate PDF")
      const blob = await pdfRes.blob()
      saveAs(blob, `Exa-ranking-lab-export-${new Date().toISOString().split("T")[0]}.pdf`)
      toast.dismiss(load)
      toast.success("Data export downloaded!")
    } catch (error: any) {
      toast.error(error.message || "Failed to export data")
    }
  }

  const handleClearData = async () => {
    try {
      const load = toast.loading("Clearing all data...")
      const res = await fetch("/api/clear-data", { method: "POST" })
      if (!res.ok) throw new Error("Failed to clear data on server")
      setQueriesStore.clearQueries()
      setSnapshotsStore.clearSnapshots()
      clearAnalytics()
      toast.dismiss(load)
      toast.success("All data cleared successfully!")
    } catch (error: any) {
      toast.error(error.message || "Failed to clear data")
    }
  }

  return {
    apiKey,
    apiStatus,
    lastTested,
    testApiConnection,
    handleSaveApiKey,
    preferences,
    handleSavePreferences,
    handleExportData,
    handleClearData,
    setApiKey: (key: string) => setSettings({ apiKey: key }),
  }
}
