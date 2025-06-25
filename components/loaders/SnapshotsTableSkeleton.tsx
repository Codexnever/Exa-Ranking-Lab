import { SkeletonBox } from "../ui/skeletonbox"

export default function SnapshotsTableSkeleton() {
  return (
    <div className="space-y-2">
      <SkeletonBox className="h-8 w-1/3" />
      <SkeletonBox className="h-6 w-full" />
      <SkeletonBox className="h-6 w-full" />
      <SkeletonBox className="h-6 w-full" />
      <SkeletonBox className="h-6 w-full" />
    </div>
  )
}
