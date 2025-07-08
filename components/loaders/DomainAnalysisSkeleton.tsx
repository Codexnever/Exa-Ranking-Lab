"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LucidePieChart } from "lucide-react"

export default function DomainAnalysisSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-gray-900 animate-pulse">Domain Analysis</CardTitle>
        <CardDescription className="animate-pulse">Domain authority tracking and ranking distribution</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-96 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg bg-gray-50 animate-pulse">
          <div className="text-center">
            <LucidePieChart className="w-16 h-16 text-gray-300 mx-auto mb-4 animate-pulse" />
            <div className="h-4 w-32 bg-gray-200 rounded mx-auto mb-2 animate-pulse" />
            <div className="h-3 w-48 bg-gray-200 rounded mx-auto animate-pulse" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
