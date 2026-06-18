// app/api/scheduler/stop/route.ts  
import { NextResponse } from "next/server"
import { schedulerService } from "@/app/services/scheduler/scheduler-service"

export async function POST() {
  try {
    const result = schedulerService.stop()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to stop scheduler' 
    }, { status: 500 })
  }
}
