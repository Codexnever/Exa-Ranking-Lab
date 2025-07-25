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

export default function CompareRankings() {
  const { user } = useAuth()
  
  // Use direct store selectors for better performance
  const queries = useQueriesStore(state => state.queries)
  const fetchQueries = useQueriesStore(state => state.fetchQueries)
  const queriesLoading = useQueriesStore(state => state.isLoading)
  
  // ✅ Use complete dataset for accurate comparisons
  const allSnapshots = useSnapshotsStore(state => state.allSnapshots) // ✅ Use complete dataset
  const fetchAllSnapshots = useSnapshotsStore(state => state.fetchAllSnapshots)
  const isLoadingAnalytics = useSnapshotsStore(state => state.isLoadingAnalytics)
  
  const [selectedQuery, setSelectedQuery] = useState("")
  const [snapshot1, setSnapshot1] = useState("")
  const [snapshot2, setSnapshot2] = useState("")
  const [isInitialized, setIsInitialized] = useState(false)

  // ✅ Initial data fetch
  useEffect(() => {
    if (user?.$id && !isInitialized) {
      const initializeData = async () => {
        try {
          console.log('[Compare] Initializing data for user:', user.$id)
          
          // Fetch both queries and complete snapshots for comparison
          await Promise.all([
            fetchQueries(user.$id),
            fetchAllSnapshots(user.$id)
          ])
          
          setIsInitialized(true)
          console.log('[Compare] Data initialized successfully')
        } catch (error) {
          console.error('[Compare] Failed to initialize data:', error)
        }
      }

      initializeData()
    }
  }, [user?.$id, isInitialized, fetchQueries, fetchAllSnapshots])

  // ✅ Use complete dataset for comparisons (more accurate)
  const { filteredSnapshots, comparison } = useCompareLogic(
    allSnapshots, // ✅ Use complete dataset, not paginated
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

  // ✅ Loading state
  const isLoading = queriesLoading || isLoadingAnalytics || !isInitialized

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
            <p className="text-xs text-gray-500 mt-1">Fetching queries and snapshots</p>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Compare Rankings</h1>
          <p className="text-gray-600 mt-1">Analyze ranking changes between different snapshots</p>
          {/* ✅ Show data stats */}
          <p className="text-xs text-gray-500 mt-1">
            {queries.length} queries • {allSnapshots.length} snapshots available for comparison
          </p>
        </div>
      </div>
      
      <CompareSetup
        queries={queries}
        selectedQuery={selectedQuery}
        setSelectedQuery={setSelectedQuery}
        snapshot1={snapshot1}
        setSnapshot1={setSnapshot1}
        snapshot2={snapshot2}
        setSnapshot2={setSnapshot2}
        filteredSnapshots={filteredSnapshots} // ✅ Uses complete dataset
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
      
      {/* ✅ Debug info (remove in production) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-gray-400 bg-gray-50 p-2 rounded">
          Debug: {allSnapshots.length} total snapshots, {filteredSnapshots.length} filtered snapshots
        </div>
      )}
    </div>
  )
}
