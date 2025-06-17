import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Bell } from "lucide-react"
import { useSettingsLogic } from "../../logic/useSettingsLogic"

export function SettingsNotifications() {
  const { notifications, setNotifications, handleSaveNotifications } = useSettingsLogic()
  return (
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
  )
}
