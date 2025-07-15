"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Ghost } from "lucide-react"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-white px-4 text-center">
      <Ghost className="w-20 h-20 text-sky-500 mb-6" />
      <h1 className="text-4xl font-bold mb-2 text-gray-900">404 — Not Found</h1>
      <p className="text-gray-600 mb-4 text-lg max-w-md">
        Bro you're lost... this isn't Exa 👀 <br />
        Maybe your query got outranked.
      </p>

      <Link href="/">
        <Button variant="default" className="bg-sky-500 hover:bg-sky-600 text-white">
          Back to Dashboard
        </Button>
      </Link>
    </div>
  )
}
