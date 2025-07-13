import { useState } from "react"
import { useAuth } from "@/lib/contexts/auth-context"
import { databases, DATABASE_ID, COLLECTIONS } from "@/lib/server/appwrite"
import { Query } from "appwrite"

export function useAccessLogsLogic() {
  const { user } = useAuth()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAccessLogs = async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.ACCESS_LOGS,
        [Query.equal("userId", user.$id)]
      )
      setLogs(response.documents)
    } catch (err: any) {
      setError(err.message || "Failed to fetch access logs")
    } finally {
      setLoading(false)
    }
  }

  return { logs, loading, error, fetchAccessLogs }
}
