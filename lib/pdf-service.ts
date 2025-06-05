import jsPDF from "jspdf"
import "jspdf-autotable"

interface ExportData {
  queries: any[]
  snapshots: any[]
  feedback: any[]
  analytics: any
}

export class PDFService {
  generateDataExport(data: ExportData, userEmail: string): Buffer {
    const doc = new jsPDF()

    // Title page
    doc.setFontSize(20)
    doc.text("Exa Ranking Lab - Data Export", 20, 30)

    doc.setFontSize(12)
    doc.text(`Generated for: ${userEmail}`, 20, 50)
    doc.text(`Export Date: ${new Date().toLocaleDateString()}`, 20, 60)
    doc.text(`Total Queries: ${data.queries.length}`, 20, 70)
    doc.text(`Total Snapshots: ${data.snapshots.length}`, 20, 80)
    doc.text(`Total Feedback: ${data.feedback.length}`, 20, 90)

    // Analytics Summary
    doc.addPage()
    doc.setFontSize(16)
    doc.text("Analytics Summary", 20, 30)

    doc.setFontSize(12)
    doc.text(`Ranking Stability: ${data.analytics.rankingStability.toFixed(1)}%`, 20, 50)
    doc.text(`Volatility Index: ${data.analytics.volatilityIndex.toFixed(1)}`, 20, 60)
    doc.text(`Domain Diversity: ${data.analytics.domainDiversity}`, 20, 70)
    doc.text(`Avg Response Time: ${data.analytics.avgResponseTime.toFixed(1)}s`, 20, 80)
    doc.text(`New Content Discovery: ${data.analytics.newContentDiscovery.toFixed(1)}%`, 20, 90)
    doc.text(`Query Success Rate: ${data.analytics.querySuccessRate.toFixed(1)}%`, 20, 100)

    // Queries table
    if (data.queries.length > 0) {
      doc.addPage()
      doc.setFontSize(16)
      doc.text("Queries", 20, 30)

      const queryTableData = data.queries.map((query) => [
        query.name,
        query.category,
        query.tags.join(", "),
        query.schedule.enabled ? query.schedule.frequency : "Manual",
        query.lastRun ? new Date(query.lastRun).toLocaleDateString() : "Never",
      ])
      ;(doc as any).autoTable({
        head: [["Name", "Category", "Tags", "Schedule", "Last Run"]],
        body: queryTableData,
        startY: 40,
        styles: { fontSize: 8 },
      })
    }

    // Recent snapshots
    if (data.snapshots.length > 0) {
      doc.addPage()
      doc.setFontSize(16)
      doc.text("Recent Snapshots", 20, 30)

      const snapshotTableData = data.snapshots
        .slice(0, 20)
        .map((snapshot) => [
          new Date(snapshot.timestamp).toLocaleDateString(),
          snapshot.results.length.toString(),
          `${snapshot.metadata.responseTime.toFixed(1)}s`,
          snapshot.metadata.totalResults.toString(),
        ])
      ;(doc as any).autoTable({
        head: [["Date", "Results", "Response Time", "Total Results"]],
        body: snapshotTableData,
        startY: 40,
        styles: { fontSize: 8 },
      })
    }

    // Feedback summary
    if (data.feedback.length > 0) {
      doc.addPage()
      doc.setFontSize(16)
      doc.text("Feedback Summary", 20, 30)

      const avgRating = data.feedback.reduce((sum, f) => sum + f.rating, 0) / data.feedback.length
      const feedbackByType = data.feedback.reduce(
        (acc, f) => {
          acc[f.feedbackType] = (acc[f.feedbackType] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      )

      doc.setFontSize(12)
      doc.text(`Average Rating: ${avgRating.toFixed(1)}/5`, 20, 50)
      doc.text(`Total Feedback Items: ${data.feedback.length}`, 20, 60)

      let yPos = 80
      Object.entries(feedbackByType).forEach(([type, count]) => {
        doc.text(`${type}: ${count}`, 20, yPos)
        yPos += 10
      })
    }

    return Buffer.from(doc.output("arraybuffer"))
  }
}

export const pdfService = new PDFService()
