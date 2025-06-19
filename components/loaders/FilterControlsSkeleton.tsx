// components/skeletons/FilterControlsSkeleton.tsx
"use client"

import { SkeletonBox } from "@/components/ui/skeletonbox"

export default function FilterControlsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SkeletonBox height="h-8" width="w-24" />
        <SkeletonBox height="h-6" width="w-20" />
      </div>

      <div className="grid gap-4 p-4 border rounded-md bg-gray-50 md:grid-cols-2">
        {/* Tags */}
        <div className="space-y-2">
          <SkeletonBox height="h-4" width="w-1/3" />
          <div className="flex gap-2 flex-wrap">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonBox key={i} height="h-6" width="w-16" />
            ))}
          </div>
          <SkeletonBox height="h-10" />
        </div>

        {/* Frequency */}
        <div className="space-y-2">
          <SkeletonBox height="h-4" width="w-1/3" />
          <SkeletonBox height="h-10" />
        </div>
      </div>
    </div>
  )
}
