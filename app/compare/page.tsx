// pages/compare.tsx
"use client"

import { useState, useEffect } from "react"
import { useQueriesStore } from "@/app/store"
import { useSnapshotsStore } from "@/app/store"
import { CompareSetup } from "@/components/compare/CompareSetup"
import { CompareSummary } from "@/components/compare/CompareSummary"
import { CompareTable } from "@/components/compare/CompareTable"
import { useCompareLogic } from "@/app/logic/compareLogic"
import { useAuth } from "@/lib/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"

export default function CompareRankings() {
  const { user } = useAuth()
  
  // Use direct store selectors for better performance
  const queries = useQueriesStore(state => state.queries)
  const fetchQueries = useQueriesStore(state => state.fetchQueries)
  const queriesLoading = useQueriesStore(state => state.isLoading)
  
  // ✅ Enhanced store selectors with validation
  const allSnapshots = useSnapshotsStore(state => state.allSnapshots)
  const fetchAllSnapshots = useSnapshotsStore(state => state.fetchAllSnapshots)
  const forceRefresh = useSnapshotsStore(state => state.forceRefresh)
  const checkAndRefreshIfEmpty = useSnapshotsStore(state => state.checkAndRefreshIfEmpty)
  const isLoadingAnalytics = useSnapshotsStore(state => state.isLoadingAnalytics)
  const isHydrated = useSnapshotsStore(state => state.isHydrated)
  
  const [selectedQuery, setSelectedQuery] = useState("")
  const [snapshot1, setSnapshot1] = useState("")
  const [snapshot2, setSnapshot2] = useState("")
  const [isInitialized, setIsInitialized] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  // ✅ Enhanced data initialization with validation
  useEffect(() => {
    if (user?.$id && !isInitialized && isHydrated) {
      const initializeData = async () => {
        try {
          console.log('[Compare] Initializing data for user:', user.$id, {
            currentSnapshots: allSnapshots.length,
            isHydrated
          })
          
          // ✅ Check if data is empty and refresh if needed
          await checkAndRefreshIfEmpty(user.$id)
          
          // Fetch both queries and complete snapshots for comparison
          await Promise.all([
            fetchQueries(user.$id),
            allSnapshots.length === 0 ? fetchAllSnapshots(user.$id) : Promise.resolve()
          ])
          
          setIsInitialized(true)
          console.log('[Compare] Data initialized successfully')
        } catch (error) {
          console.error('[Compare] Failed to initialize data:', error)
          
          // ✅ Retry logic with exponential backoff
          if (retryCount < 3) {
            const delay = Math.pow(2, retryCount) * 1000 // 1s, 2s, 4s
            setTimeout(() => {
              setRetryCount(prev => prev + 1)
              setIsInitialized(false)
            }, delay)
          }
        }
      }

      initializeData()
    }
  }, [user?.$id, isInitialized, isHydrated, fetchQueries, fetchAllSnapshots, checkAndRefreshIfEmpty, allSnapshots.length, retryCount])

  // ✅ Manual refresh function
  const handleManualRefresh = async () => {
    if (!user?.$id) return
    
    try {
      setIsInitialized(false)
      await forceRefresh(user.$id)
      await fetchQueries(user.$id)
      setIsInitialized(true)
    } catch (error) {
      console.error('[Compare] Manual refresh failed:', error)
    }
  }

  // ✅ Use complete dataset for comparisons (more accurate)
  const { filteredSnapshots, comparison } = useCompareLogic(
    allSnapshots,
    selectedQuery, 
    snapshot1, 
    snapshot2
  )

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric", 
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  // ✅ Enhanced loading state
  const isLoading = queriesLoading || isLoadingAnalytics || !isInitialized || !isHydrated

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Compare Rankings</h1>
            <p className="text-gray-600 mt-1">Analyze ranking changes between different snapshots</p>
          </div>
        </div>
        
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading comparison data...</p>
            <p className="text-xs text-gray-500 mt-1">
              {!isHydrated ? 'Hydrating store...' : 'Fetching queries and snapshots'}
            </p>
            {retryCount > 0 && (
              <p className="text-xs text-amber-600 mt-2">
                Retry attempt {retryCount}/3
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ✅ Authentication guard
  if (!user) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Compare Rankings</h1>
            <p className="text-gray-600 mt-1">Analyze ranking changes between different snapshots</p>
          </div>
        </div>
        
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Authentication Required</h3>
            <p className="text-gray-500">Please log in to compare rankings.</p>
          </div>
        </div>
      </div>
    )
  }

  // ✅ Empty state with refresh option
  if (allSnapshots.length === 0 && isInitialized) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Compare Rankings</h1>
            <p className="text-gray-600 mt-1">Analyze ranking changes between different snapshots</p>
          </div>
          <Button onClick={handleManualRefresh} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Data
          </Button>
        </div>
        
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Snapshots Available</h3>
            <p className="text-gray-500 mb-4">Create some queries and snapshots first to compare rankings.</p>
            <Button onClick={handleManualRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Refreshing
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Compare Rankings</h1>
          <p className="text-gray-600 mt-1">Analyze ranking changes between different snapshots</p>
          <p className="text-xs text-gray-500 mt-1">
            {queries.length} queries • {allSnapshots.length} snapshots available for comparison
          </p>
        </div>
        <Button onClick={handleManualRefresh} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
      
      <CompareSetup
        queries={queries}
        selectedQuery={selectedQuery}
        setSelectedQuery={setSelectedQuery}
        snapshot1={snapshot1}
        setSnapshot1={setSnapshot1}
        snapshot2={snapshot2}
        setSnapshot2={setSnapshot2}
        filteredSnapshots={filteredSnapshots}
        formatDate={formatDate}
      />
      
      {comparison.length > 0 && (
        <>
          <CompareSummary comparison={comparison} />
          <CompareTable comparison={comparison} />
        </>
      )}
      
      {comparison.length === 0 && snapshot1 && snapshot2 && (
        <div className="text-center py-12">
          <div className="text-center">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Changes Found</h3>
            <p className="text-gray-500">The selected snapshots have identical rankings.</p>
            <p className="text-xs text-gray-400 mt-2">
              This could indicate stable search results between the selected time periods.
            </p>
          </div>
        </div>
      )}
      
      {!snapshot1 || !snapshot2 ? (
        <div className="text-center py-12">
          <div className="text-center">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2h4a1 1 0 110 2h-1v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6H3a1 1 0 110-2h4zM9 6v10h6V6H9z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Select Snapshots to Compare</h3>
            <p className="text-gray-500">Choose a query and two snapshots to analyze ranking changes.</p>
            <div className="mt-4 text-sm text-gray-400 space-y-1">
              <p>• Select a query from the dropdown</p>
              <p>• Choose two different snapshots to compare</p>
              <p>• View detailed ranking changes and trends</p>
            </div>
          </div>
        </div>
      ) : null}
      
      {/* ✅ Enhanced debug info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-gray-400 bg-gray-50 p-2 rounded">
          Debug: {allSnapshots.length} total snapshots, {filteredSnapshots.length} filtered snapshots, 
          Hydrated: {isHydrated ? 'Yes' : 'No'}, Retries: {retryCount}
        </div>
      )}
    </div>
  )
}
