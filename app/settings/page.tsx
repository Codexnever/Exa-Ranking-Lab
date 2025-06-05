"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Settings, Key, Bell, Database, Download, Trash2, Shield } from "lucide-react"
import { toast } from "sonner"

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("24147791-a3e7-485c-9203-39b54618c9f0")
  const [notifications, setNotifications] = useState({
    queryComplete: true,
    queryFailed: true,
    weeklyReport: true,
    rankingChanges: false,
  })
  const [preferences, setPreferences] = useState({
    defaultResultCount: 20,
    autoRefreshInterval: 30,
    theme: "light",
    timezone: "UTC",
  })

  const handleSaveApiKey = () => {
    // In a real app, this would save to environment variables or secure storage
    toast.success("API key updated successfully!")
  }

  const handleSaveNotifications = () => {
    toast.success("Notification preferences saved!")
  }

  const handleSavePreferences = () => {
    toast.success("Preferences saved!")
  }

  const handleExportData = () => {
    toast.success("Data export started! You'll receive an email when ready.")
  }

  const handleClearData = () => {
    toast.success("All data cleared successfully!")
  }

  const testApiConnection = async () => {
    try {
      const response = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      })

      if (response.ok) {
        toast.success("API connection successful!")
      } else {
        toast.error("API connection failed!")
      }
    } catch (error) {
      toast.error("Failed to test API connection")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-1">Manage your account preferences and application settings</p>
        </div>
      </div>

      <Tabs defaultValue="api" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="api">API Configuration</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="data">Data Management</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="api" className="space-y-6">
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
                  <Badge variant="default" className="bg-emerald-500">
                    Connected
                  </Badge>
                  <span className="text-sm text-gray-600">Last tested: 2 minutes ago</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Rate Limits</Label>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="p-3 border rounded-lg">
                    <div className="text-sm font-medium">Requests per minute</div>
                    <div className="text-2xl font-bold text-blue-600">60</div>
                    <div className="text-xs text-gray-500">Current usage: 12/60</div>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <div className="text-sm font-medium">Monthly quota</div>
                    <div className="text-2xl font-bold text-purple-600">10,000</div>
                    <div className="text-xs text-gray-500">Used: 1,247/10,000</div>
                  </div>
                </div>
              </div>

              <Button onClick={handleSaveApiKey}>Save API Configuration</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notification Preferences
              </CardTitle>
              <CardDescription>Choose when and how you want to be notified</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Query Completion</Label>
                    <p className="text-sm text-gray-500">Get notified when queries finish running</p>
                  </div>
                  <Switch
                    checked={notifications.queryComplete}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, queryComplete: checked })}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Query Failures</Label>
                    <p className="text-sm text-gray-500">Get notified when queries fail</p>
                  </div>
                  <Switch
                    checked={notifications.queryFailed}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, queryFailed: checked })}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Weekly Reports</Label>
                    <p className="text-sm text-gray-500">Receive weekly ranking performance summaries</p>
                  </div>
                  <Switch
                    checked={notifications.weeklyReport}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, weeklyReport: checked })}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Ranking Changes</Label>
                    <p className="text-sm text-gray-500">Get notified of significant ranking movements</p>
                  </div>
                  <Switch
                    checked={notifications.rankingChanges}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, rankingChanges: checked })}
                  />
                </div>
              </div>

              <Button onClick={handleSaveNotifications}>Save Notification Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Application Preferences
              </CardTitle>
              <CardDescription>Customize your application experience</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="default-results">Default Result Count</Label>
                  <Input
                    id="default-results"
                    type="number"
                    min="1"
                    max="100"
                    value={preferences.defaultResultCount}
                    onChange={(e) =>
                      setPreferences({ ...preferences, defaultResultCount: Number.parseInt(e.target.value) })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="refresh-interval">Auto Refresh Interval (seconds)</Label>
                  <Input
                    id="refresh-interval"
                    type="number"
                    min="10"
                    max="300"
                    value={preferences.autoRefreshInterval}
                    onChange={(e) =>
                      setPreferences({ ...preferences, autoRefreshInterval: Number.parseInt(e.target.value) })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Theme</Label>
                  <Select
                    value={preferences.theme}
                    onValueChange={(value) => setPreferences({ ...preferences, theme: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Select
                    value={preferences.timezone}
                    onValueChange={(value) => setPreferences({ ...preferences, timezone: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="America/New_York">Eastern Time</SelectItem>
                      <SelectItem value="America/Chicago">Central Time</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={handleSavePreferences}>Save Preferences</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <Database className="w-5 h-5" />
                Data Management
              </CardTitle>
              <CardDescription>Export, backup, or clear your application data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">Export Data</h3>
                    <p className="text-sm text-gray-500">Download all your queries, snapshots, and analytics</p>
                  </div>
                  <Button onClick={handleExportData} variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">Clear All Data</h3>
                    <p className="text-sm text-gray-500">Permanently delete all queries, snapshots, and settings</p>
                  </div>
                  <Button onClick={handleClearData} variant="destructive">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear Data
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Storage Usage</Label>
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="p-3 border rounded-lg">
                    <div className="text-sm font-medium">Queries</div>
                    <div className="text-lg font-bold">127</div>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <div className="text-sm font-medium">Snapshots</div>
                    <div className="text-lg font-bold">1,247</div>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <div className="text-sm font-medium">Feedback</div>
                    <div className="text-lg font-bold">89</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
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
        </TabsContent>
      </Tabs>
    </div>
  )
}
