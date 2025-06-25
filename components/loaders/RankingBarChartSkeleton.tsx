import { SkeletonBox } from "@/components/ui/skeletonbox";

export default function RankingBarChartSkeleton() {
  return (
    <div className="h-80 bg-white rounded-lg border flex items-center justify-center">
      <SkeletonBox height="h-64" width="w-full" />
    </div>
  );
}
