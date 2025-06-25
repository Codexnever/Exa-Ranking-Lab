import { SkeletonBox } from "@/components/ui/skeletonbox";

export default function CategoryPieChartSkeleton() {
  return (
    <div className="h-80 bg-white rounded-lg border flex items-center justify-center">
      <SkeletonBox height="h-48" width="w-48" className="rounded-full" />
    </div>
  );
}
