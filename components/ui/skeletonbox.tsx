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
      className={`rounded-md bg-gray-100 animate-shimmer bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 ${height} ${width} ${className}`}
      style={{
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.2s linear infinite',
      }}
    />
  )
}

// Add shimmer animation globally (in your CSS):
// @keyframes shimmer {
//   0% { background-position: -200% 0; }
//   100% { background-position: 200% 0; }
// }
