import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useSettingsLogic } from "./useSettingsLogic"
import { Key } from "lucide-react"

export function SettingsApiConfig() {
  const { apiKey, setApiKey, testApiConnection, handleSaveApiKey, apiStatus, lastTested } = useSettingsLogic()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-gray-900 flex items-center gap-2">
          <Key className="w-5 h-5" />
          Exa API Configuration
        </CardTitle>
        <CardDescription>Configure your Exa API key and connection settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="api-key">API Key</Label>
          <div className="flex gap-2">
            <Input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Exa API key"
            />
            <Button onClick={testApiConnection} variant="outline">
              Test Connection
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Your API key is used to authenticate requests to the Exa API. Keep it secure.
          </p>
        </div>
        <div className="space-y-2">
          <Label>API Status</Label>
          <div className="flex items-center gap-2">
            <Badge variant={apiStatus === "connected" ? "default" : "destructive"} className={apiStatus === "connected" ? "bg-emerald-500" : "bg-red-500"}>
              {apiStatus === "connected" ? "Connected" : apiStatus === "disconnected" ? "Disconnected" : "Unknown"}
            </Badge>
            <span className="text-sm text-gray-600">{lastTested ? `Last tested: ${lastTested}` : "Not tested yet"}</span>
          </div>
        </div>
        <Button onClick={handleSaveApiKey}>Save API Configuration</Button>
      </CardContent>
    </Card>
  )
}
