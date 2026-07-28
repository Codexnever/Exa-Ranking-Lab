// lib/services/DriftAlertService.ts
//
// Runs at the end of every cron batch execution.
// Checks all processed queries for threshold crossings and
// sends alerts via email (Resend) with webhook fallback.
//
// INTEGRATION: call DriftAlertService.checkAndAlert() at the end of
// process-scheduled-route.ts after all queries have been processed.

import type { DriftAnalysisResult } from "@/types/type"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DriftAlert {
  userId:    string
  queryId:   string
  queryName: string
  driftScore: number
  driftType: "high" | "critical"
  timestamp: Date
  driftTimeline: {
    previous: number
    current:  number
    change:   number
  }
}

export interface AlertConfig {
  highThreshold:     number  // default: 60
  criticalThreshold: number  // default: 80
  emailEnabled:      boolean
  webhookUrl?:       string
}

const DEFAULT_CONFIG: AlertConfig = {
  highThreshold:     60,
  criticalThreshold: 80,
  emailEnabled:      true,
}

// ─── DriftAlertService ───────────────────────────────────────────────────────

export class DriftAlertService {
  private config: AlertConfig

  constructor(config: Partial<AlertConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Main entry point — call this after every cron batch.
   * Checks all results, fires alerts for threshold crossings.
   */
  async checkAndAlert(
    userId:  string,
    results: DriftAnalysisResult[]
  ): Promise<{ alertsFired: number; errors: string[] }> {
    const alerts = this.detectThresholdCrossings(results)
    const errors: string[] = []
    let alertsFired = 0

    if (alerts.length === 0) return { alertsFired: 0, errors: [] }

    // Group alerts by type for a single summary email (not one per query)
    const critical = alerts.filter(a => a.driftType === "critical")
    const high     = alerts.filter(a => a.driftType === "high")

    try {
      if (this.config.emailEnabled) {
        await this.sendEmailAlert(userId, critical, high)
        alertsFired++
      }
    } catch (err) {
      const msg = `Email alert failed: ${err instanceof Error ? err.message : String(err)}`
      console.error("[DriftAlertService]", msg)
      errors.push(msg)
    }

    try {
      if (this.config.webhookUrl) {
        await this.sendWebhookAlert(userId, alerts)
        alertsFired++
      }
    } catch (err) {
      const msg = `Webhook alert failed: ${err instanceof Error ? err.message : String(err)}`
      console.error("[DriftAlertService]", msg)
      errors.push(msg)
    }

    // Store alerts in Appwrite for in-app notification panel
    try {
      await this.storeAlertsInAppwrite(userId, alerts)
    } catch (err) {
      errors.push(`Alert storage failed: ${err instanceof Error ? err.message : String(err)}`)
    }

    return { alertsFired, errors }
  }

  // ── Threshold detection ────────────────────────────────────────────────────

  private detectThresholdCrossings(results: DriftAnalysisResult[]): DriftAlert[] {
    const alerts: DriftAlert[] = []

    for (const result of results) {
      const current  = result.latestDrift ?? 0
      const previous = result.driftTimeline?.length >= 2
        ? result.driftTimeline[result.driftTimeline.length - 2]?.driftScore ?? 0
        : 0

      // Only alert if we CROSSED a threshold (not if it was already high)
      // This prevents repeated alerts on the same stuck-high query
      const wasBelowHigh     = previous < this.config.highThreshold
      const wasBelowCritical = previous < this.config.criticalThreshold
      const isNowHigh        = current >= this.config.highThreshold
      const isNowCritical    = current >= this.config.criticalThreshold

      if (isNowCritical && wasBelowCritical) {
        alerts.push({
          userId:    result.queryId, // ← caller sets actual userId
          queryId:   result.queryId,
          queryName: result.queryName,
          driftScore: current,
          driftType: "critical",
          timestamp: new Date(),
          driftTimeline: { previous, current, change: current - previous },
        })
      } else if (isNowHigh && wasBelowHigh) {
        alerts.push({
          userId:    result.queryId,
          queryId:   result.queryId,
          queryName: result.queryName,
          driftScore: current,
          driftType: "high",
          timestamp: new Date(),
          driftTimeline: { previous, current, change: current - previous },
        })
      }
    }

    return alerts
  }

  // ── Email via Resend ───────────────────────────────────────────────────────

  private async sendEmailAlert(
    userId:   string,
    critical: DriftAlert[],
    high:     DriftAlert[]
  ): Promise<void> {
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
      console.warn("[DriftAlertService] RESEND_API_KEY not set — email skipped")
      return
    }

    // Fetch user email from Appwrite (you already have this in auth flow)
    const userEmail = await this.getUserEmail(userId)
    if (!userEmail) {
      console.warn(`[DriftAlertService] No email found for userId ${userId}`)
      return
    }

    const totalAlerts = critical.length + high.length

    const subject = critical.length > 0
      ? `🚨 ${critical.length} critical drift alert${critical.length > 1 ? 's' : ''} — Exa Ranking Lab`
      : `⚠️ ${high.length} drift alert${high.length > 1 ? 's' : ''} — Exa Ranking Lab`

    const html = this.buildEmailHtml(critical, high)

    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from:    "Exa Ranking Lab <alerts@yourdomain.com>",
        to:      [userEmail],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`Resend API ${res.status}: ${JSON.stringify(err)}`)
    }

    console.log(`[DriftAlertService] Email sent to ${userEmail} — ${totalAlerts} alerts`)
  }

  private buildEmailHtml(critical: DriftAlert[], high: DriftAlert[]): string {
    const rows = (alerts: DriftAlert[], color: string) =>
      alerts.map(a => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${a.queryName}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:${color};font-weight:bold">${a.driftScore.toFixed(1)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#666">+${a.driftTimeline.change.toFixed(1)} since last snapshot</td>
        </tr>
      `).join("")

    return `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1e293b">Exa Ranking Lab — Drift Alert</h2>
        <p style="color:#475569">The following queries crossed drift thresholds in the latest snapshot run.</p>
        
        ${critical.length > 0 ? `
          <h3 style="color:#dc2626">🚨 Critical Drift (score ≥ ${this.config.criticalThreshold})</h3>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#fee2e2">
              <th style="padding:8px 12px;text-align:left">Query</th>
              <th style="padding:8px 12px;text-align:left">Drift Score</th>
              <th style="padding:8px 12px;text-align:left">Change</th>
            </tr></thead>
            <tbody>${rows(critical, "#dc2626")}</tbody>
          </table>
        ` : ""}
        
        ${high.length > 0 ? `
          <h3 style="color:#d97706;margin-top:24px">⚠️ High Drift (score ≥ ${this.config.highThreshold})</h3>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#fef3c7">
              <th style="padding:8px 12px;text-align:left">Query</th>
              <th style="padding:8px 12px;text-align:left">Drift Score</th>
              <th style="padding:8px 12px;text-align:left">Change</th>
            </tr></thead>
            <tbody>${rows(high, "#d97706")}</tbody>
          </table>
        ` : ""}
        
        <div style="margin-top:24px;padding:16px;background:#f8fafc;border-radius:8px">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/drift" 
             style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
            View Drift Radar →
          </a>
        </div>
        
        <p style="color:#94a3b8;font-size:12px;margin-top:24px">
          You're receiving this because you have drift alerts enabled.<br>
          Manage alert settings at ${process.env.NEXT_PUBLIC_APP_URL}/settings
        </p>
      </div>
    `
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  private async sendWebhookAlert(userId: string, alerts: DriftAlert[]): Promise<void> {
    if (!this.config.webhookUrl) return

    const res = await fetch(this.config.webhookUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event:     "drift_threshold_crossed",
        userId,
        timestamp: new Date().toISOString(),
        alerts:    alerts.map(a => ({
          queryId:    a.queryId,
          queryName:  a.queryName,
          driftScore: a.driftScore,
          driftType:  a.driftType,
          change:     a.driftTimeline.change,
        })),
      }),
    })

    if (!res.ok) throw new Error(`Webhook ${res.status}: ${res.statusText}`)
    console.log(`[DriftAlertService] Webhook fired — ${alerts.length} alerts`)
  }

  // ── Appwrite storage for in-app notifications ──────────────────────────────

  private async storeAlertsInAppwrite(userId: string, alerts: DriftAlert[]): Promise<void> {
    const notificationsCollectionId = process.env.COLLECTION_NOTIFICATIONS
    if (!notificationsCollectionId) return

    // Lazy import to avoid bundling Appwrite SDK everywhere
    const { databases, ID } = await import("@/app/server/appwrite/appwrite-server")

    for (const alert of alerts) {
      await databases.createDocument(
        process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
        notificationsCollectionId,
        ID.unique(),
        {
          userId,
          queryId:    alert.queryId,
          queryName:  alert.queryName,
          driftScore: alert.driftScore,
          driftType:  alert.driftType,
          change:     alert.driftTimeline.change,
          read:       false,
          createdAt:  new Date().toISOString(),
        }
      )
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async getUserEmail(userId: string): Promise<string | null> {
    try {
      const { databases } = await import("@/app/server/appwrite/appwrite-server")
      const { Query }     = await import("node-appwrite")
      const result = await databases.listDocuments(
        process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
        process.env.COLLECTION_USERS!,
        [Query.equal("userId", userId), Query.limit(1)]
      )
      return result.documents[0]?.email ?? null
    } catch {
      return null
    }
  }
}

export const driftAlertService = new DriftAlertService()