import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, Trash2, Database } from "lucide-react"
import { Label } from "@/components/ui/label"
import { useSettingsLogic } from "../../app/logic/useSettingsLogic"
import { useQueriesStore } from "@/app/store"
import { useSnapshots } from "@/hooks/use-snapshots"
import { useAuth } from "@/lib/contexts/auth-context"

export function SettingsDataManagement() {
  const { handleExportData, handleClearData } = useSettingsLogic()
  const { user } = useAuth()
  const queries = useQueriesStore(state => state.queries)
  const { snapshots } = useSnapshots()
  // Only count queries/snapshots for current user if user is present
  const userQueries = user ? queries.filter(q => q.userId === user.$id) : queries
  const userSnapshots = user ? snapshots.filter(s => s.userId === user.$id) : snapshots

  return (
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
              <div className="text-lg font-bold">{userQueries.length}</div>
            </div>
            <div className="p-3 border rounded-lg">
              <div className="text-sm font-medium">Snapshots</div>
              <div className="text-lg font-bold">{userSnapshots.length}</div>
            </div>
            <div className="p-3 border rounded-lg">
              <div className="text-sm font-medium">Feedback</div>
              <div className="text-lg font-bold">--</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
