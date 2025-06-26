import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Shield, ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"
import { useAccessLogsLogic } from "@/logic/useAccessLogsLogic"

export function SettingsSecurity() {
  const [showLogs, setShowLogs] = useState(false)
  const { logs, loading, error, fetchAccessLogs } = useAccessLogsLogic()

  const handleToggleLogs = async () => {
    try {
      if (!showLogs && logs.length === 0) {
        await fetchAccessLogs()
      }
      setShowLogs((prev) => !prev)
    } catch (err) {
      // fallback error
      alert('Failed to load logs. Please try again later.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-gray-900 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Security Settings
        </CardTitle>
        <CardDescription>Manage your account security and access controls</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="p-4 border rounded-lg">
            <h3 className="font-medium mb-2">API Key Security</h3>
            <p className="text-sm text-gray-500 mb-3">
              Your API key is encrypted and stored securely. It's only used for Exa API requests.
            </p>
            <Badge variant="default" className="bg-emerald-500">
              Secure
            </Badge>
          </div>
          <div className="p-4 border rounded-lg">
            <h3 className="font-medium mb-2">Data Encryption</h3>
            <p className="text-sm text-gray-500 mb-3">
              All sensitive data is encrypted at rest and in transit using industry-standard encryption.
            </p>
            <Badge variant="default" className="bg-emerald-500">
              Enabled
            </Badge>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium mb-2">Access Logs</h3>
                <p className="text-sm text-gray-500 mb-3">
                  Monitor API usage and access patterns for security auditing.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleToggleLogs}>
                View Logs {showLogs ? <ChevronUp className="inline w-4 h-4 ml-1" /> : <ChevronDown className="inline w-4 h-4 ml-1" />}
              </Button>
            </div>
            {showLogs && (
              <div className="mt-4 max-h-64 overflow-y-auto bg-gray-50 rounded p-2 border">
                {loading && <div className="text-sm text-gray-500">Loading logs...</div>}
                {error && (
                  <div className="text-sm text-red-500">
                    {error.includes('collectionId') ? (
                      <>
                        Unable to load logs: Missing collection configuration.<br />
                        Please contact support or check your environment variables.
                      </>
                    ) : (
                      <>Error: {error}</>
                    )}
                  </div>
                )}
                {!loading && !error && logs.length === 0 && (
                  <div className="text-sm text-gray-500 text-center py-4">
                    <span className="block text-lg">🗒️</span>
                    <span>No access logs found for your account yet.<br/>Your activity will appear here once you start using the app.</span>
                  </div>
                )}
                {!loading && !error && logs.length > 0 && (
                  <div className="space-y-3">
                    {logs.map((log) => (
                      <div
                        key={log.$id || log.timestamp}
                        className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-white rounded shadow-sm border border-gray-200 hover:shadow transition"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-gray-900 text-sm">
                              {log.action}
                            </span>
                            <span className="text-xs text-gray-400">
                              {log.timestamp ? new Date(log.timestamp).toLocaleString() : "-"}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                            <span className="inline-flex items-center gap-1">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0-1.657-2.686-3-6-3s-6 1.343-6 3m12 0c0 1.657-2.686 3-6 3s-6-1.343-6-3m12 0v2c0 1.657-2.686 3-6 3s-6-1.343-6-3v-2" /></svg>
                              {log.ipAddress || "-"}
                            </span>
                            <span className="truncate max-w-xs" title={typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}>
                              {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
