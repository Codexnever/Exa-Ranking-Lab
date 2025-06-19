// components/skeletons/QueryTableSkeleton.tsx
"use client"

import { SkeletonBox } from "@/components/ui/skeletonbox"

export default function QueryTableSkeleton() {
  return (
    <div className="rounded-md border">
      <div className="space-y-4 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center gap-4">
            <SkeletonBox height="h-5" width="w-1/3" />
            <SkeletonBox height="h-5" width="w-1/6" />
            <SkeletonBox height="h-5" width="w-1/4" />
            <SkeletonBox height="h-5" width="w-1/5" />
            <SkeletonBox height="h-5" width="w-1/6" />
            <SkeletonBox height="h-8" width="w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
