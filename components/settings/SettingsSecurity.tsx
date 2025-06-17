import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Shield } from "lucide-react"

export function SettingsSecurity() {
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
            <h3 className="font-medium mb-2">Access Logs</h3>
            <p className="text-sm text-gray-500 mb-3">
              Monitor API usage and access patterns for security auditing.
            </p>
            <Button variant="outline" size="sm">
              View Logs
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
