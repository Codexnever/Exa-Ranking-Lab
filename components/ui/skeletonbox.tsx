// components/ui/skeleton-box.tsx
export function SkeletonBox({
  className = "",
  height = "h-4",
  width = "w-full",
}: {
  className?: string
  height?: string
  width?: string
}) {
  return (
    <div
      className={`rounded-md bg-gray-200 dark:bg-gray-700 animate-shimmer bg-[linear-gradient(90deg,#e5e7eb,25%,#f3f4f6,50%,#e5e7eb,75%)] bg-[length:200%_100%] ${height} ${width} ${className}`}
    />
  )
}
