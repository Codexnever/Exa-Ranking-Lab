"use client"

import { useState } from "react"
import { useQueriesStore } from "@/app/store" // ✅ Direct store import
import { useSnapshotsStore } from "@/app/store" // ✅ Direct store import  
import { CompareSetup } from "@/components/compare/CompareSetup"
import { CompareSummary } from "@/components/compare/CompareSummary"
import { CompareTable } from "@/components/compare/CompareTable"
import { useCompareLogic } from "@/app/logic/compareLogic"
import { useAuth } from "@/lib/contexts/auth-context"

export default function CompareRankings() {
  // ✅ Use direct store selectors for better performance
  const queries = useQueriesStore(state => state.queries)
  const snapshots = useSnapshotsStore(state => state.snapshots)
  
  const [selectedQuery, setSelectedQuery] = useState("")
  const [snapshot1, setSnapshot1] = useState("")
  const [snapshot2, setSnapshot2] = useState("")

  const { filteredSnapshots, comparison } = useCompareLogic(snapshots, selectedQuery, snapshot1, snapshot2)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric", 
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Compare Rankings</h1>
          <p className="text-gray-600 mt-1">Analyze ranking changes between different snapshots</p>
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
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Changes Found</h3>
          <p className="text-gray-500">The selected snapshots have identical rankings.</p>
        </div>
      )}
      
      {!snapshot1 || !snapshot2 ? (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Select Snapshots to Compare</h3>
          <p className="text-gray-500">Choose a query and two snapshots to analyze ranking changes.</p>
        </div>
      ) : null}
    </div>
  )
}
