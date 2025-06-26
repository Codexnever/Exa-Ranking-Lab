import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Settings } from "lucide-react"
import { useSettingsLogic } from "../../logic/useSettingsLogic"
import { FeatureComingSoon } from "@/components/ui/FeatureComingSoon"

export function SettingsPreferences() {
  const { preferences, setPreferences, handleSavePreferences } = useSettingsLogic()
  return (
    <Card className="relative overflow-hidden">
      {/* Here we disable all and add disable page here  */}
      <FeatureComingSoon label="Preferences" />
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
              onChange={(e) => setPreferences({ ...preferences, defaultResultCount: Number.parseInt(e.target.value) })}
              disabled
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
              onChange={(e) => setPreferences({ ...preferences, autoRefreshInterval: Number.parseInt(e.target.value) })}
              disabled
            />
          </div>
          <div className="space-y-2">
            <Label>Theme</Label>
            <Select
              value={preferences.theme}
              onValueChange={(value) => setPreferences({ ...preferences, theme: value })}
              disabled
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
              disabled
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
        <Button onClick={handleSavePreferences} disabled>
          Save Preferences
        </Button>
      </CardContent>
    </Card>
  )
}
