import { NextRequest, NextResponse } from "next/server"
import { generateDataExportPDF } from "@/lib/pdf/export"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const { data, userEmail } = await req.json()
    // Generate PDF buffer using pdfkit (server-side)
    const pdfBuffer = await generateDataExportPDF(data, userEmail || "user")
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=Exa-Ranking-Lab-export-${new Date().toISOString().split("T")[0]}.pdf`,
      },
    })
  } catch (error: any) {
    console.error("PDF EXPORT ERROR", error)
    return NextResponse.json({ error: error.message || "Failed to generate PDF", stack: error.stack }, { status: 500 })
  }
}
