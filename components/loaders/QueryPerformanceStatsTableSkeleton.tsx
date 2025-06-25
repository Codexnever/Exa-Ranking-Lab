import { SkeletonBox } from "@/components/ui/skeletonbox";

export default function QueryPerformanceStatsTableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            {[...Array(5)].map((_, i) => (
              <th key={i}><SkeletonBox height="h-4" width="w-16" /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...Array(4)].map((_, i) => (
            <tr key={i}>
              {[...Array(5)].map((_, j) => (
                <td key={j}><SkeletonBox height="h-4" width="w-16" /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
