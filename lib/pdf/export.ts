// IMPORTANT: Only pass user-specific data to this function!
// This PDF export function does NOT perform any user filtering.
// The calling API route MUST ensure that only the current user's data is provided.
// 
// Example: The /api/export-data/pdf route fetches data filtered by userId and passes it here.
// 
// Never pass unfiltered or multi-user data to this function.

import PDFDocument from "pdfkit"
import { PassThrough } from "stream"
import path from "path"
import fs from "fs"

export async function generateDataExportPDF(data: any, userEmail: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const fontPath = path.resolve(process.cwd(), "public", "times.ttf")
    const doc = fs.existsSync(fontPath)
      ? new PDFDocument({ margin: 40, font: fontPath })
      : new PDFDocument({ margin: 40 })
    const stream = new PassThrough()
    const chunks: Buffer[] = []

    // Header info
    doc.info.Title = "Exa Ranking Lab - Data Export"
    doc.fontSize(20).text("Exa Ranking Lab - Data Export", { align: "center" })
    doc.moveDown()
    doc.fontSize(12).text(`Generated for: ${userEmail}`)
    doc.text(`Export Date: ${new Date().toLocaleDateString()}`)
    doc.text(`Total Queries: ${data.queries.length}`)
    doc.text(`Total Snapshots: ${data.snapshots.length}`)
    doc.text(`Total Feedback: ${data.feedback.length}`)
    doc.moveDown()

    // Analytics Summary
    doc.fontSize(16).text("Analytics Summary", { underline: true })
    doc.fontSize(12)
    doc.text(`Ranking Stability: ${data.analytics.rankingStability?.toFixed(1) ?? "-"}%`)
    doc.text(`Volatility Index: ${data.analytics.volatilityIndex?.toFixed(1) ?? "-"}`)
    doc.text(`Domain Diversity: ${data.analytics.domainDiversity ?? "-"}`)
    doc.text(`Avg Response Time: ${data.analytics.avgResponseTime?.toFixed(1) ?? "-"}s`)
    doc.text(`New Content Discovery: ${data.analytics.newContentDiscovery?.toFixed(1) ?? "-"}%`)
    doc.text(`Query Success Rate: ${data.analytics.querySuccessRate?.toFixed(1) ?? "-"}%`)
    doc.moveDown()

    // Queries Table
    if (data.queries.length > 0) {
      doc.addPage()
      doc.fontSize(16).text("Queries", { underline: true })
      doc.moveDown()
      data.queries.forEach((q: any, i: number) => {
        doc.fontSize(12).text(`${i + 1}. ${q.name} [${q.category}] - Tags: ${q.tags?.join(", ") ?? "-"}`)
        doc.text(`   Schedule: ${q.schedule?.enabled ? q.schedule.frequency : "Manual"}, Last Run: ${q.lastRun ? new Date(q.lastRun).toLocaleDateString() : "Never"}`)
        doc.moveDown(0.5)
      })
    }

    // Snapshots Table
    if (data.snapshots.length > 0) {
      doc.addPage()
      doc.fontSize(16).text("Recent Snapshots", { underline: true })
      doc.moveDown()
      data.snapshots.slice(0, 20).forEach((s: any, i: number) => {
        doc.fontSize(12).text(`${i + 1}. Date: ${new Date(s.timestamp).toLocaleDateString()}, Results: ${s.results.length}, Response Time: ${s.metadata.responseTime?.toFixed(1) ?? "-"}s, Total Results: ${s.metadata.totalResults}`)
      })
    }

    // Feedback Summary
    if (data.feedback.length > 0) {
      doc.addPage()
      doc.fontSize(16).text("Feedback Summary", { underline: true })
      doc.moveDown()
      const avgRating = data.feedback.reduce((sum: number, f: any) => sum + (f.rating || 0), 0) / data.feedback.length
      doc.fontSize(12).text(`Average Rating: ${avgRating.toFixed(1)}/5`)
      doc.text(`Total Feedback Items: ${data.feedback.length}`)

      const feedbackByType = data.feedback.reduce((acc: any, f: any) => {
        acc[f.feedbackType] = (acc[f.feedbackType] || 0) + 1
        return acc
      }, {})
      Object.entries(feedbackByType).forEach(([type, count]: [string, any]) => {
        doc.text(`${type}: ${count}`)
      })
    }

    doc.end()
    doc.pipe(stream)
    stream.on("data", (chunk) => chunks.push(chunk))
    stream.on("end", () => resolve(Buffer.concat(chunks)))
    stream.on("error", reject)
  })
}
