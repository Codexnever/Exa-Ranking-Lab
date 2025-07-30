// app/api/scheduler/start/route.ts
import { NextResponse } from "next/server"
import { schedulerService } from "@/app/services/scheduler-service"

export async function POST() {
  try {
    const result = await schedulerService.start()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to start scheduler' 
    }, { status: 500 })
  }
}

export async function GET() {
  const status = schedulerService.getStatus()
  return NextResponse.json({ success: true, status })
}
