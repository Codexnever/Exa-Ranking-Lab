// components/skeletons/QueryFormSkeleton.tsx
"use client"

import { SkeletonBox } from "@/components/ui/skeletonbox"

export default function QueryFormSkeleton() {
  return (
    <div className="space-y-6 p-6 border rounded-md bg-white dark:bg-gray-400">
      <SkeletonBox height="h-5" width="w-1/4" />
      <SkeletonBox height="h-10" />
      <SkeletonBox height="h-5" width="w-1/4" />
      <SkeletonBox height="h-10" />
      <SkeletonBox height="h-5" width="w-1/4" />
      <SkeletonBox height="h-10" />
      <SkeletonBox height="h-5" width="w-1/4" />
      <SkeletonBox height="h-10" />
      <SkeletonBox height="h-5" width="w-1/4" />
      <SkeletonBox height="h-10" />
      <SkeletonBox height="h-10" />
    </div>
  )
}
