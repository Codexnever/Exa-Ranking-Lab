import { SkeletonBox } from "@/components/ui/skeletonbox";

export default function TopPerformingQueriesSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3 rounded-lg border bg-white">
          <SkeletonBox height="h-6" width="w-1/4" />
          <SkeletonBox height="h-4" width="w-1/2" />
        </div>
      ))}
    </div>
  );
}
