const listDocuments = jest.fn()
const getDocument = jest.fn()
const updateDocument = jest.fn()

jest.mock("@/app/server/appwrite/appwrite-server", () => ({
  DATABASE_ID: "database",
  databases: { listDocuments, getDocument, updateDocument },
}))
jest.mock("@/lib/middleware/security/security-middleware", () => ({
  withEnhancedSecurity: (handler: unknown) => handler,
}))

import { getNotificationsHandler } from "../route"
import { markNotificationReadHandler } from "../[id]/read/route"
import { markAllNotificationsReadHandler } from "../read-all/route"

const context = { user: { $id: "owner" } } as any

describe("notification routes", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.COLLECTION_NOTIFICATIONS = "notifications"
  })

  test("lists only the authenticated owner and reports backend failures", async () => {
    listDocuments.mockResolvedValueOnce({ documents: [{ $id: "n1", userId: "owner" }] })
    const success = await getNotificationsHandler({} as any, context)
    expect(success.status).toBe(200)
    expect(listDocuments.mock.calls[0][2].join(" ")).toContain("owner")

    listDocuments.mockRejectedValueOnce(new Error("private Appwrite detail"))
    const failure = await getNotificationsHandler({} as any, context)
    expect(failure.status).toBe(503)
    expect(await failure.json()).toEqual({ error: "Notification service is temporarily unavailable" })
  })

  test("mark-one-read enforces ownership", async () => {
    getDocument.mockResolvedValueOnce({ $id: "n1", userId: "other" })
    const response = await markNotificationReadHandler(
      {} as any,
      context,
      { params: Promise.resolve({ id: "n1" }) },
    )
    expect(response.status).toBe(403)
    expect(updateDocument).not.toHaveBeenCalled()
  })

  test("mark-all-read uses the owner filter and updates the complete page", async () => {
    listDocuments
      .mockResolvedValueOnce({ documents: [{ $id: "n1" }, { $id: "n2" }] })
    updateDocument.mockResolvedValue({})
    const response = await markAllNotificationsReadHandler({} as any, context)
    expect(response.status).toBe(200)
    expect(updateDocument).toHaveBeenCalledTimes(2)
    expect(listDocuments.mock.calls[0][2].join(" ")).toContain("owner")
  })
})
