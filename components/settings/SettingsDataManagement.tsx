// components/settings/SettingsDataManagement.tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, Trash2, Database, Loader2 } from "lucide-react"
import { Label } from "@/components/ui/label"
import { useSettingsLogic } from "../../app/logic/useSettingsLogic"
import { useQueriesStore } from "@/app/store"
import { useSnapshotsStore } from "@/app/store" // ✅ Use store directly
import { useAuth } from "@/lib/contexts/auth-context"

export function SettingsDataManagement() {
  const { handleExportData, handleClearData, isExporting, isClearing } = useSettingsLogic()
  const { user } = useAuth()
  
  // ✅ Use store selectors directly for data counts
  const queries = useQueriesStore(state => state.queries)
  const allSnapshots = useSnapshotsStore(state => state.allSnapshots) // ✅ Use complete dataset
  const isLoadingSnapshots = useSnapshotsStore(state => state.isLoadingAnalytics)
  const isLoadingQueries = useQueriesStore(state => state.isLoading)
  
  // Only count queries/snapshots for current user if user is present
  const userQueries = user ? queries.filter(q => q.userId === user.$id) : queries
  const userSnapshots = user ? allSnapshots.filter(s => s.userId === user.$id) : allSnapshots

  // Calculate storage estimates
  const estimatedStorageKB = Math.round(
    (userQueries.length * 0.5) + // ~0.5KB per query
    (userSnapshots.length * 2) + // ~2KB per snapshot
    (userSnapshots.reduce((sum, s) => sum + (s.results?.length || 0), 0) * 0.1) // ~0.1KB per result
  )

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
              <p className="text-sm text-gray-500">
                Download all your queries, snapshots, and analytics
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Includes {userQueries.length} queries and {userSnapshots.length} snapshots
              </p>
            </div>
            <Button 
              onClick={handleExportData} 
              variant="outline"
              disabled={isExporting || (userQueries.length === 0 && userSnapshots.length === 0)}
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </>
              )}
            </Button>
          </div>
          
          <div className="flex items-center justify-between p-4 border rounded-lg border-red-200 bg-red-50">
            <div>
              <h3 className="font-medium text-red-900">Clear All Data</h3>
              <p className="text-sm text-red-700">
                Permanently delete all queries, snapshots, and settings
              </p>
              <p className="text-xs text-red-600 mt-1">
                ⚠️ This action cannot be undone
              </p>
            </div>
            <Button 
              onClick={handleClearData} 
              variant="destructive"
              disabled={isClearing || (userQueries.length === 0 && userSnapshots.length === 0)}
            >
              {isClearing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear Data
                </>
              )}
            </Button>
          </div>
        </div>
        
        <div className="space-y-2">
          <Label>Storage Usage</Label>
          <div className="grid gap-2 md:grid-cols-4">
            <div className="p-3 border rounded-lg">
              <div className="text-sm font-medium text-gray-600">Queries</div>
              {isLoadingQueries ? (
                <div className="h-6 w-8 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                <div className="text-lg font-bold text-blue-600">{userQueries.length}</div>
              )}
              <div className="text-xs text-gray-500">Active searches</div>
            </div>
            
            <div className="p-3 border rounded-lg">
              <div className="text-sm font-medium text-gray-600">Snapshots</div>
              {isLoadingSnapshots ? (
                <div className="h-6 w-8 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                <div className="text-lg font-bold text-green-600">{userSnapshots.length}</div>
              )}
              <div className="text-xs text-gray-500">Ranking captures</div>
            </div>
            
            <div className="p-3 border rounded-lg">
              <div className="text-sm font-medium text-gray-600">Results</div>
              {isLoadingSnapshots ? (
                <div className="h-6 w-8 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                <div className="text-lg font-bold text-purple-600">
                  {userSnapshots.reduce((sum, s) => sum + (s.results?.length || 0), 0)}
                </div>
              )}
              <div className="text-xs text-gray-500">Total search results</div>
            </div>
            
            <div className="p-3 border rounded-lg">
              <div className="text-sm font-medium text-gray-600">Storage</div>
              {isLoadingSnapshots || isLoadingQueries ? (
                <div className="h-6 w-12 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                <div className="text-lg font-bold text-orange-600">
                  {estimatedStorageKB < 1024 
                    ? `${estimatedStorageKB}KB` 
                    : `${(estimatedStorageKB / 1024).toFixed(1)}MB`
                  }
                </div>
              )}
              <div className="text-xs text-gray-500">Estimated size</div>
            </div>
          </div>
        </div>

        {/* ✅ Data breakdown section */}
        {(userQueries.length > 0 || userSnapshots.length > 0) && (
          <div className="space-y-2">
            <Label>Data Breakdown</Label>
            <div className="p-4 bg-gray-50 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span>Most recent snapshot:</span>
                <span className="font-medium">
                  {userSnapshots.length > 0 
                    ? new Date(userSnapshots[0].timestamp).toLocaleDateString()
                    : 'None'
                  }
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Date range:</span>
                <span className="font-medium">
                  {userSnapshots.length > 1 
                    ? `${new Date(userSnapshots[userSnapshots.length - 1].timestamp).toLocaleDateString()} - ${new Date(userSnapshots[0].timestamp).toLocaleDateString()}`
                    : userSnapshots.length === 1 
                      ? new Date(userSnapshots[0].timestamp).toLocaleDateString()
                      : 'None'
                  }
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Average results per snapshot:</span>
                <span className="font-medium">
                  {userSnapshots.length > 0 
                    ? Math.round(userSnapshots.reduce((sum, s) => sum + (s.results?.length || 0), 0) / userSnapshots.length)
                    : 0
                  }
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ✅ Empty state */}
        {userQueries.length === 0 && userSnapshots.length === 0 && !isLoadingQueries && !isLoadingSnapshots && (
          <div className="text-center py-8 text-gray-500">
            <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Found</h3>
            <p className="text-gray-500">Create some queries and snapshots to see data management options.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
