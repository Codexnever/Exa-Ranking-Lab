import {
  databases,
  DATABASE_ID,
  COLLECTIONS,
} from "@/app/server/appwrite/appwrite-server"

import {
  ID,
  Query,
} from "node-appwrite"

import type { QueryConfig } from "@/types/type"

import { CATEGORY_MAP } from "@/constants/category-map"

import {
  loadFromStorage,
  saveToStorage,
  transformQueryDocument,
} from "../../../utils/db-utils"

/**
 * Provides local and Appwrite-backed CRUD operations for ranking queries.
 */
export class QueryService {
  private isLocal: boolean

  constructor(
    isLocal: boolean,
  ) {
    this.isLocal = isLocal
  }

  /**
   * Creates a new query after validating its category.
   *
   * Remote persistence stores the raw category key so create, update, and read
   * operations use the same canonical representation.
   */
  async createQuery(
    query: Omit<
      QueryConfig,
      "id" | "createdAt"
    >,
  ): Promise<QueryConfig> {
    if (
      !query.category ||
      !(query.category in CATEGORY_MAP)
    ) {
      throw new Error(
        `Invalid category: "${query.category}"`,
      )
    }

    /*
     * This service runs server-side, so ID generation must come from
     * node-appwrite rather than the browser Appwrite SDK.
     */
    const id = ID.unique()

    if (this.isLocal) {
      const newQuery:
        QueryConfig = {
        ...query,
        id,
        createdAt:
          new Date(),
      }

      const queries =
        loadFromStorage<QueryConfig>(
          "queries",
        )

      queries.push(newQuery)

      saveToStorage(
        "queries",
        queries,
      )

      return newQuery
    }

    try {
      const document =
        await databases.createDocument(
          DATABASE_ID,
          COLLECTIONS.QUERIES,
          id,
          {
            name:
              query.name,
            query:
              query.query,

            /*
             * Persist the raw category key, such as "news", rather than the
             * display label from CATEGORY_MAP.
             */
            category:
              query.category,

            userId:
              query.userId,

            status:
              (query as any)
                .status ??
              "active",

            filters:
              JSON.stringify(
                query.filters ?? {},
              ),

            schedule:
              JSON.stringify(
                query.schedule ?? {},
              ),

            tags:
              JSON.stringify(
                query.tags ?? [],
              ),

            createdAt:
              new Date().toISOString(),
          },
        )

      return transformQueryDocument(
        document,
        false,
      )
    } catch (error: any) {
      const message =
        error?.message ??
        "Failed to create query"

      console.error(
        "[QueryService] createQuery failed:",
        error,
      )

      throw new Error(message)
    }
  }

  /**
   * Returns queries owned by a user.
   *
   * Remote reads require a user ID so records are never fetched globally by
   * this method.
   */
  async getQueries(
    userId?: string,
  ): Promise<QueryConfig[]> {
    if (this.isLocal) {
      const queries =
        loadFromStorage<QueryConfig>(
          "queries",
        )

      return queries.filter(
        (query) =>
          !userId ||
          query.userId === userId,
      )
    }

    if (!userId) {
      console.error(
        "[QueryService] getQueries: userId required for remote fetch",
      )

      return []
    }

    const response =
      await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.QUERIES,
        [
          Query.equal(
            "userId",
            userId,
          ),
        ],
      )

    return response.documents.map(
      (document) =>
        transformQueryDocument(
          document,
          false,
        ),
    )
  }

  /**
   * Fetches scheduled queries across all users for the cron scheduler.
   *
   * Appwrite records are cursor-paginated and scanned up to maxScan. Scheduling
   * is currently filtered in application code because schedule.enabled is not
   * represented by a dedicated indexed database attribute.
   */
  async getAllScheduledQueries(
    maxScan = 2000,
  ): Promise<QueryConfig[]> {
    if (this.isLocal) {
      const queries =
        loadFromStorage<QueryConfig>(
          "queries",
        )

      return queries.filter(
        (query) =>
          query.schedule?.enabled,
      )
    }

    const PAGE_SIZE = 100

    const results:
      QueryConfig[] = []

    let cursor:
      | string
      | undefined

    let scanned = 0

    while (
      scanned < maxScan
    ) {
      const queryFilters = [
        Query.limit(PAGE_SIZE),
        Query.orderAsc("$id"),
      ]

      if (cursor) {
        queryFilters.push(
          Query.cursorAfter(
            cursor,
          ),
        )
      }

      const response =
        await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.QUERIES,
          queryFilters,
        )

      if (
        response.documents.length ===
        0
      ) {
        break
      }

      for (
        const document of response.documents
      ) {
        const query =
          transformQueryDocument(
            document,
            false,
          )

        if (
          query.schedule?.enabled
        ) {
          results.push(query)
        }
      }

      scanned +=
        response.documents.length

      cursor =
        response.documents[
          response.documents.length - 1
        ].$id

      if (
        response.documents.length <
        PAGE_SIZE
      ) {
        break
      }
    }

    if (
      scanned >= maxScan
    ) {
      console.warn(
        `[QueryService] getAllScheduledQueries: hit scan cap of ${maxScan} documents. ` +
          "Consider adding an indexed 'scheduleEnabled' boolean attribute for DB-level filtering.",
      )
    }

    return results
  }

  /**
   * Loads one query by ID.
   *
   * Missing or unreadable queries return null rather than throwing.
   */
  async getQuery(
    id: string,
  ): Promise<QueryConfig | null> {
    if (!id) {
      console.error(
        "[QueryService] getQuery: id required",
      )

      return null
    }

    try {
      if (this.isLocal) {
        const queries =
          loadFromStorage<QueryConfig>(
            "queries",
          )

        return (
          queries.find(
            (query) =>
              query.id === id,
          ) ?? null
        )
      }

      const document =
        await databases.getDocument(
          DATABASE_ID,
          COLLECTIONS.QUERIES,
          id,
        )

      return transformQueryDocument(
        document,
        false,
      )
    } catch (error) {
      console.error(
        "[QueryService] getQuery failed:",
        error,
      )

      return null
    }
  }

  /**
   * Applies partial updates to an existing query.
   *
   * Category updates persist the raw category key to remain compatible with
   * createQuery and transformQueryDocument.
   */
  async updateQuery(
    id: string,
    updates: Partial<QueryConfig>,
  ): Promise<QueryConfig> {
    if (this.isLocal) {
      const queries =
        loadFromStorage<QueryConfig>(
          "queries",
        )

      const index =
        queries.findIndex(
          (query) =>
            query.id === id,
        )

      if (index === -1) {
        throw new Error(
          `Query ${id} not found`,
        )
      }

      queries[index] = {
        ...queries[index],
        ...updates,
      }

      saveToStorage(
        "queries",
        queries,
      )

      return queries[index]
    }

    try {
      const data:
        Record<string, any> = {}

      if (updates.name) {
        data.name =
          updates.name
      }

      if (updates.query) {
        data.query =
          updates.query
      }

      if (updates.category) {
        /*
         * CATEGORY_MAP values are display labels. Persistence must continue to
         * use the canonical raw key, such as "news", to match createQuery.
         */
        if (
          !(
            updates.category in
            CATEGORY_MAP
          )
        ) {
          throw new Error(
            `Invalid category: "${updates.category}"`,
          )
        }

        data.category =
          updates.category
      }

      if (updates.filters) {
        data.filters =
          JSON.stringify(
            updates.filters,
          )
      }

      if (updates.schedule) {
        data.schedule =
          JSON.stringify(
            updates.schedule,
          )
      }

      if (updates.tags) {
        data.tags =
          JSON.stringify(
            updates.tags,
          )
      }

      if (updates.lastRun) {
        data.lastRun =
          new Date(
            updates.lastRun,
          ).toISOString()
      }

      if (updates.userId) {
        data.userId =
          updates.userId
      }

      const document =
        await databases.updateDocument(
          DATABASE_ID,
          COLLECTIONS.QUERIES,
          id,
          data,
        )

      return transformQueryDocument(
        document,
        false,
      )
    } catch (error: any) {
      const message =
        error?.message ??
        "Failed to update query"

      console.error(
        "[QueryService] updateQuery failed:",
        error,
      )

      throw new Error(message)
    }
  }

  /**
   * Deletes a query and all snapshots belonging to it.
   *
   * Remote deletion repeatedly fetches and deletes up to 500 snapshots at a
   * time before deleting the query itself. This prevents snapshots beyond the
   * first page from becoming orphaned.
   */
  async deleteQuery(
    id: string,
    opts?: {
      userId?: string
      ipAddress?: string
      userAgent?: any
    },
  ): Promise<boolean> {
    try {
      if (this.isLocal) {
        const queries =
          loadFromStorage<QueryConfig>(
            "queries",
          )

        const snapshots =
          loadFromStorage<any>(
            "snapshots",
          )

        saveToStorage(
          "queries",
          queries.filter(
            (query) =>
              query.id !== id,
          ),
        )

        saveToStorage(
          "snapshots",
          snapshots.filter(
            (snapshot: any) =>
              snapshot.queryId !==
              id,
          ),
        )

        return true
      }

      /*
       * Do not delete the query header until every associated snapshot has
       * been removed. No offset is required because each deletion shrinks the
       * remaining result set for the same queryId filter.
       */
      let totalDeleted = 0

      while (true) {
        const snapshotList =
          await databases.listDocuments(
            DATABASE_ID,
            COLLECTIONS.SNAPSHOTS,
            [
              Query.equal(
                "queryId",
                id,
              ),
              Query.limit(500),
            ],
          )

        if (
          snapshotList.documents
            .length === 0
        ) {
          break
        }

        await Promise.all(
          snapshotList.documents.map(
            (snapshot) =>
              databases.deleteDocument(
                DATABASE_ID,
                COLLECTIONS.SNAPSHOTS,
                snapshot.$id,
              ),
          ),
        )

        totalDeleted +=
          snapshotList.documents.length

        if (
          snapshotList.documents
            .length < 500
        ) {
          break
        }
      }

      if (
        totalDeleted > 0
      ) {
        console.log(
          `[QueryService] deleteQuery: removed ${totalDeleted} snapshots for query ${id}`,
        )
      }

      await databases.deleteDocument(
        DATABASE_ID,
        COLLECTIONS.QUERIES,
        id,
      )

      return true
    } catch (error) {
      console.error(
        "[QueryService] deleteQuery failed:",
        error,
      )

      return false
    }
  }
}