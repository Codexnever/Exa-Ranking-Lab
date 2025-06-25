import { SkeletonBox } from "../ui/skeletonbox"

export default function SettingsApiConfigSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonBox className="h-8 w-1/3" />
      <SkeletonBox className="h-6 w-1/2" />
      <SkeletonBox className="h-12 w-full" />
      <SkeletonBox className="h-12 w-full" />
    </div>
  )
}
