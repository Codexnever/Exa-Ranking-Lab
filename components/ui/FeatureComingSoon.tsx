import React from "react"
import { Bell, SlidersHorizontal } from "lucide-react"

export function FeatureComingSoon({ label = "Notifications & Preferences" }: { label?: string }) {
  return (
    <div className="absolute inset-0 bg-gray-100/80 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center pointer-events-none select-none">
      <Bell className="w-10 h-10 text-gray-400 mb-2" />
      <SlidersHorizontal className="w-8 h-8 text-gray-300 mb-2" />
      <h2 className="text-xl font-semibold text-gray-500 mb-1">{label}</h2>
      <p className="text-gray-400 text-center max-w-xs mb-2">This feature will be available soon. You&apos;ll be able to customize this area soon.</p>
      <span className="inline-block bg-gray-300/60 text-gray-600 text-xs px-3 py-1 rounded-full">Coming Soon</span>
    </div>
  )
}
