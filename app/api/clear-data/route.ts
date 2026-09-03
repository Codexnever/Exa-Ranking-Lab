import { type NextRequest, NextResponse } from "next/server"
import {
  COLLECTIONS,
  DATABASE_ID,
  Query,
  databases,
} from "@/app/server/appwrite/appwrite-server"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"

const DELETE_PAGE_SIZE = 100

async function deleteDocumentsByField(
  collectionId: string,
  field: string,
  value: string,
) {
  let deletedCount = 0

  while (true) {
    const response = await databases.listDocuments(DATABASE_ID, collectionId, [
      Query.equal(field, value),
      Query.limit(DELETE_PAGE_SIZE),
    ])

    if (response.documents.length === 0) return deletedCount

    for (const document of response.documents) {
      await databases.deleteDocument(DATABASE_ID, collectionId, document.$id)
      deletedCount += 1
    }
  }
}

async function listDocumentIdsByField(
  collectionId: string,
  field: string,
  value: string,
) {
  const documentIds: string[] = []
  let cursor: string | undefined

  while (true) {
    const queries = [
      Query.equal(field, value),
      Query.limit(DELETE_PAGE_SIZE),
      Query.select(["$id"]),
    ]
    if (cursor) queries.push(Query.cursorAfter(cursor))

    const response = await databases.listDocuments(
      DATABASE_ID,
      collectionId,
      queries,
    )
    documentIds.push(...response.documents.map((document) => document.$id))

    if (response.documents.length < DELETE_PAGE_SIZE) return documentIds
    cursor = response.documents.at(-1)?.$id
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (body?.confirmDeletion !== true) {
    return NextResponse.json(
      { error: "Deletion confirmation is required" },
      { status: 400 },
    )
  }

  try {
    if (!DATABASE_ID) {
      throw new Error("Clear-data collection configuration is incomplete")
    }

    let deletedCount = 0

    // These child collections do not contain an owner field. Resolve their
    // parent IDs through authenticated, owner-scoped headers before deleting.
    const [traceIds, executionIds] = await Promise.all([
      listDocumentIdsByField(
        COLLECTIONS.EVALUATION_STAGE_TRACES,
        "createdByUserId",
        user.$id,
      ),
      listDocumentIdsByField(
        COLLECTIONS.EVALUATION_STRATEGY_EXECUTIONS,
        "createdByUserId",
        user.$id,
      ),
    ])

    for (const traceId of traceIds) {
      deletedCount += await deleteDocumentsByField(
        COLLECTIONS.EVALUATION_STAGE_TRACE_DOCUMENTS,
        "traceId",
        traceId,
      )
    }
    for (const executionId of executionIds) {
      deletedCount += await deleteDocumentsByField(
        COLLECTIONS.EVALUATION_STRATEGY_EXECUTION_DOCUMENTS,
        "executionId",
        executionId,
      )
    }

    const evaluationCollections = [
      [COLLECTIONS.EVALUATION_PAYLOAD_CHUNKS, "ownerUserId"],
      [COLLECTIONS.EVALUATION_RUN_QUERIES, "ownerUserId"],
      [COLLECTIONS.EVALUATION_STRATEGY_EXECUTIONS, "createdByUserId"],
      [COLLECTIONS.EVALUATION_STAGE_TRACES, "createdByUserId"],
      [COLLECTIONS.EVALUATION_RUNS, "createdByUserId"],
      [COLLECTIONS.EVALUATION_QUERY_CONFIGS, "createdByUserId"],
      [COLLECTIONS.RELEVANCE_JUDGMENT_PAYLOADS, "createdByUserId"],
      [COLLECTIONS.RELEVANCE_JUDGMENTS, "createdByUserId"],
      [COLLECTIONS.EVALUATION_QUERIES, "createdByUserId"],
      [COLLECTIONS.EVALUATION_STRATEGIES, "createdByUserId"],
      [COLLECTIONS.EVALUATION_DATASETS, "ownerUserId"],
    ] as const

    for (const [collectionId, ownerField] of evaluationCollections) {
      deletedCount += await deleteDocumentsByField(
        collectionId,
        ownerField,
        user.$id,
      )
    }

    // Delete the original ranking data after dependent evaluation records.
    for (const collectionId of [
      COLLECTIONS.SNAPSHOTS,
      COLLECTIONS.FEEDBACK,
      COLLECTIONS.ACCESS_LOGS,
      COLLECTIONS.QUERIES,
    ]) {
      deletedCount += await deleteDocumentsByField(
        collectionId,
        "userId",
        user.$id,
      )
    }

    return NextResponse.json({
      success: true,
      message: "All data cleared successfully",
      deletedCount,
    })
  } catch (error) {
    console.error("[Clear Data] Server deletion failed", error)
    return NextResponse.json(
      { error: "Failed to clear data on server" },
      { status: 500 },
    )
  }
}
