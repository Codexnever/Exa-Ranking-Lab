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

    // Header Section
    doc.info.Title = "Exa Ranking Lab - Data Export"
    doc.fontSize(22).fillColor("#222").text("Exa Ranking Lab - Data Export", { align: "center", underline: true })
    doc.moveDown(0.5)
    doc.fontSize(12).fillColor("#444").text(`Generated for: ${userEmail}`)
    doc.text(`Export Date: ${new Date().toLocaleDateString()}`)
    doc.moveDown(0.5)
    doc.fontSize(12).fillColor("#222").text(`Total Queries: ${data.queries.length}    Total Snapshots: ${data.snapshots.length}    Total Feedback: ${data.feedback.length}`)
    doc.moveDown(1)
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke()
    doc.moveDown(1)

    // Analytics Summary Table
    doc.fontSize(16).fillColor("#222").text("Analytics Summary", { underline: true })
    doc.moveDown(0.5)
    doc.fontSize(12).fillColor("#333")
    const analyticsRows = [
      ["Ranking Stability", `${data.analytics.rankingStability?.toFixed(1) ?? "-"}%`],
      ["Volatility Index", `${data.analytics.volatilityIndex?.toFixed(1) ?? "-"}`],
      ["Domain Diversity", `${data.analytics.domainDiversity ?? "-"}`],
      ["Avg Response Time", `${data.analytics.avgResponseTime?.toFixed(1) ?? "-"}s`],
      ["New Content Discovery", `${data.analytics.newContentDiscovery?.toFixed(1) ?? "-"}%`],
      ["Query Success Rate", `${data.analytics.querySuccessRate?.toFixed(1) ?? "-"}%`],
    ]
    analyticsRows.forEach(([label, value]) => {
      doc.text(`${label}:`, { continued: true, width: 200 }).fillColor("#0057b8").text(` ${value}`, { continued: false })
    })
    doc.moveDown(1)
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke()
    doc.moveDown(1)

    // Queries Table
    if (data.queries.length > 0) {
      doc.fontSize(15).fillColor("#222").text("Queries", { underline: true })
      doc.moveDown(0.5)
      doc.fontSize(11).fillColor("#333")
      doc.text("Name", { continued: true, width: 120 }).text("Category", { continued: true, width: 80 }).text("Tags", { continued: true, width: 120 }).text("Schedule", { continued: true, width: 80 }).text("Last Run", { width: 80 })
      doc.moveDown(0.2)
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke()
      data.queries.forEach((q: any) => {
        doc.text(q.name, { continued: true, width: 120 })
        doc.text(q.category, { continued: true, width: 80 })
        doc.text(q.tags?.join(", ") ?? "-", { continued: true, width: 120 })
        doc.text(q.schedule?.enabled ? q.schedule.frequency : "Manual", { continued: true, width: 80 })
        doc.text(q.lastRun ? new Date(q.lastRun).toLocaleDateString() : "Never", { width: 80 })
      })
      doc.moveDown(1)
    }

    // Snapshots Table
    if (data.snapshots.length > 0) {
      doc.fontSize(15).fillColor("#222").text("Recent Snapshots", { underline: true })
      doc.moveDown(0.5)
      doc.fontSize(11).fillColor("#333")
      doc.text("Date", { continued: true, width: 80 }).text("Results", { continued: true, width: 60 }).text("Response Time", { continued: true, width: 100 }).text("Total Results", { width: 80 })
      doc.moveDown(0.2)
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke()
      data.snapshots.slice(0, 20).forEach((s: any) => {
        doc.text(new Date(s.timestamp).toLocaleDateString(), { continued: true, width: 80 })
        doc.text(s.results.length.toString(), { continued: true, width: 60 })
        doc.text(s.metadata.responseTime?.toFixed(1) ?? "-" + "s", { continued: true, width: 100 })
        doc.text(s.metadata.totalResults?.toString() ?? "-", { width: 80 })
      })
      doc.moveDown(1)
    }

    // Feedback Table
    if (data.feedback.length > 0) {
      doc.fontSize(15).fillColor("#222").text("Feedback Summary", { underline: true })
      doc.moveDown(0.5)
      doc.fontSize(11).fillColor("#333")
      doc.text("Type", { continued: true, width: 80 }).text("Rating", { continued: true, width: 60 }).text("Comment", { width: 300 })
      doc.moveDown(0.2)
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke()
      data.feedback.forEach((f: any) => {
        doc.text(f.feedbackType ?? "-", { continued: true, width: 80 })
        doc.text((f.rating ?? "-").toString(), { continued: true, width: 60 })
        doc.text(f.comment ?? "-", { width: 300 })
      })
      doc.moveDown(1)
      // Feedback stats
      const avgRating = data.feedback.reduce((sum: number, f: any) => sum + (f.rating || 0), 0) / data.feedback.length
      doc.fontSize(12).fillColor("#0057b8").text(`Average Rating: ${avgRating.toFixed(1)}/5    Total Feedback Items: ${data.feedback.length}`)
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
