import { useState } from "react"
import { useAuth } from "@/lib/middleware/authentication/auth-context"
import { databases, DATABASE_ID, COLLECTIONS, Query } from "@/app/server/appwrite/appwrite"

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
         [
    Query.equal("userId", user.$id),
    Query.orderDesc("timestamp"), 
    Query.limit(30)             
  ]
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
