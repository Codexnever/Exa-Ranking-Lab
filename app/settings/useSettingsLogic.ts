import { useState, useEffect } from "react"
import { toast } from "sonner"
import { saveAs } from "file-saver"
import { useQueriesStore, useSnapshotsStore, useAnalyticsStore } from "@/store"

export function useSettingsLogic() {
  // API Key logic
  const [apiKey, setApiKey] = useState("24147791-a3e7-485c-9203-39b54618c9f0")
  const [apiStatus, setApiStatus] = useState<'connected' | 'disconnected' | 'unknown'>("unknown")
  const [lastTested, setLastTested] = useState<string | null>(null)

  const testApiConnection = async () => {
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
      
      if (response.ok && data.success) {
        toast.success(`API connection successful! Found ${data.resultsCount} result(s)`, { id: loadingId })
        setApiStatus("connected")
      } else {
        toast.error(data.message || "API connection failed!", { id: loadingId })
        setApiStatus("disconnected")
      }
      setLastTested(new Date().toLocaleTimeString())
      
    } catch (error) {
      console.error('Test connection error:', error)
      toast.error("Failed to test API connection", { id: loadingId })
      setApiStatus("disconnected")
      setLastTested(new Date().toLocaleTimeString())
    }
  }
  const handleSaveApiKey = () => {
    toast.success("API key updated successfully!")
  }

  // Notifications logic
  const [notifications, setNotifications] = useState({
    queryComplete: true,
    queryFailed: true,
    weeklyReport: true,
    rankingChanges: false,
  })
  const handleSaveNotifications = () => {
    toast.success("Notification preferences saved!")
  }

  // Preferences logic
  const [preferences, setPreferences] = useState({
    defaultResultCount: 20,
    autoRefreshInterval: 30,
    theme: "light",
    timezone: "UTC",
  })
  const handleSavePreferences = () => {
    toast.success("Preferences saved!")
  }

  // Data management logic
  const { clearAnalytics } = useAnalyticsStore()
  const setQueriesStore = useQueriesStore((state) => state)
  const setSnapshotsStore = useSnapshotsStore((state) => state)

  const handleExportData = async () => {
    try {
      toast.loading("Generating data export PDF...")
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
      toast.success("Data export downloaded!")
    } catch (error: any) {
      toast.error(error.message || "Failed to export data")
    }
  }

  const handleClearData = async () => {
    try {
      toast.loading("Clearing all data...")
      const res = await fetch("/api/clear-data", { method: "POST" })
      if (!res.ok) throw new Error("Failed to clear data on server")
      setQueriesStore.queries = []
      setQueriesStore.error = null
      setSnapshotsStore.snapshots = []
      setSnapshotsStore.error = null
      clearAnalytics()
      toast.success("All data cleared successfully!")
    } catch (error: any) {
      toast.error(error.message || "Failed to clear data")
    }
  }

  return {
    apiKey, setApiKey, testApiConnection, handleSaveApiKey,
    apiStatus, lastTested, 
    notifications, setNotifications, handleSaveNotifications,
    preferences, setPreferences, handleSavePreferences,
    handleExportData, handleClearData
  }
}
