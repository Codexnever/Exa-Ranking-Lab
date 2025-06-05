// /api/queries/[id]/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/lib/database-service"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const query = await databaseService.getQuery(params.id)
    if (!query) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 })
    }
    if (query.userId !== user.$id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.json(query)
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch query" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const query = await databaseService.getQuery(params.id)
    if (!query) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 })
    }
    if (query.userId !== user.$id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const body = await request.json()
    const updated = await databaseService.updateQuery(params.id, body)
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: "Failed to update query" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const query = await databaseService.getQuery(params.id)
    if (!query) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 })
    }
    if (query.userId !== user.$id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const success = await databaseService.deleteQuery(params.id)
    if (!success) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete query" }, { status: 500 })
  }
}
