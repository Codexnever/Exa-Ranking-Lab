import { SkeletonBox } from "@/components/ui/skeletonbox";

export default function AnalyticsAPIsSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="p-4 rounded-lg border bg-white flex flex-col gap-2">
          <SkeletonBox height="h-5" width="w-1/2" />
          <SkeletonBox height="h-8" width="w-1/3" />
          <SkeletonBox height="h-3" width="w-2/3" />
        </div>
      ))}
    </div>
  );
}
