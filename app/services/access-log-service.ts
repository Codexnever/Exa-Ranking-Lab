// AccessLogService handles all access log operations
import { databases, DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite"
import { ID } from "appwrite"
import { loadFromStorage, saveToStorage } from "./db-utils"

export class AccessLogService {
  private isLocal: boolean
  constructor(isLocal: boolean) {
    this.isLocal = isLocal
  }

  async logAccess(
    userId: string,
    action: string,
    details: Record<string, any>,
    ipAddress: string,
    userAgentInfo: {
      browser: string;
      version: string;
      deviceType: string;
      os: string;
      isBot: boolean;
    }
  ): Promise<void> {
    try {
      if (this.isLocal) {
        const logs = loadFromStorage<any>("access_logs")
        logs.push({
          userId,
          action,
          details,
          timestamp: new Date(),
          ipAddress,
          ...userAgentInfo,
        })
        saveToStorage("access_logs", logs)
        return
      }
      await databases.createDocument(DATABASE_ID, COLLECTIONS.ACCESS_LOGS, ID.unique(), {
        userId,
        action,
        details: JSON.stringify(details),
        timestamp: new Date().toISOString(),
        ipAddress,
        userAgentBrowser: userAgentInfo.browser,
        userAgentVersion: userAgentInfo.version,
        userAgentDeviceType: userAgentInfo.deviceType,
        userAgentOS: userAgentInfo.os,
        userAgentIsBot: userAgentInfo.isBot,
      })
    } catch (error) {
      console.error("❌ Failed to log access:", error)
    }
  }
}
