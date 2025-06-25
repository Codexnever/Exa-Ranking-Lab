import { SkeletonBox } from "../ui/skeletonbox"

export default function SnapshotsFiltersSkeleton() {
  return (
    <div className="flex gap-4">
      <SkeletonBox className="h-10 w-40" />
      <SkeletonBox className="h-10 w-40" />
      <SkeletonBox className="h-10 w-40" />
    </div>
  )
}
