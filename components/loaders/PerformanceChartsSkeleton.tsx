import { SkeletonBox } from "@/components/ui/skeletonbox";

export default function PerformanceChartsSkeleton() {
  return (
    <div className="h-96 bg-white rounded-lg border flex items-center justify-center">
      <SkeletonBox height="h-72" width="w-full" />
    </div>
  );
}
