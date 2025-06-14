import nodemailer from "nodemailer"

interface EmailOptions {
  to: string
  subject: string
  html: string
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType: string
  }>
}

class EmailService {
  private transporter: nodemailer.Transporter

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    })
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: options.to,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments,
      })
    } catch (error) {
      console.error("Email sending failed:", error)
      throw new Error("Failed to send email")
    }
  }
//Dont be send querycompletion notification  throw email that is hectic
  async sendQueryCompletionNotification(userEmail: string, queryName: string, resultCount: number): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Query Completed Successfully</h2>
        <p>Your query "<strong>${queryName}</strong>" has completed successfully.</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p><strong>Results Found:</strong> ${resultCount}</p>
          <p><strong>Completed At:</strong> ${new Date().toLocaleString()}</p>
        </div>
        <p>You can view the results in your <a href="${process.env.NEXT_PUBLIC_APP_URL}/snapshots" style="color: #2563eb;">Exa Ranking Lab dashboard</a>.</p>
      </div>
    `

    await this.sendEmail({
      to: userEmail,
      subject: `Query "${queryName}" Completed`,
      html,
    })
  }
//that is also hectic sendQueryFaliureNoti. 
  async sendQueryFailureNotification(userEmail: string, queryName: string, error: string): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Query Failed</h2>
        <p>Your query "<strong>${queryName}</strong>" has failed to execute.</p>
        <div style="background: #fef2f2; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #dc2626;">
          <p><strong>Error:</strong> ${error}</p>
          <p><strong>Failed At:</strong> ${new Date().toLocaleString()}</p>
        </div>
        <p>Please check your query configuration and try again in your <a href="${process.env.NEXT_PUBLIC_APP_URL}/query-builder" style="color: #2563eb;">Exa Ranking Lab dashboard</a>.</p>
      </div>
    `

    await this.sendEmail({
      to: userEmail,
      subject: `Query "${queryName}" Failed`,
      html,
    })
  }

  async sendWeeklyReport(userEmail: string, reportData: any): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Weekly Ranking Report</h2>
        <p>Here's your weekly ranking performance summary:</p>
        
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <h3>Key Metrics</h3>
          <p><strong>Queries Executed:</strong> ${reportData.queriesExecuted}</p>
          <p><strong>Average Ranking Stability:</strong> ${reportData.avgStability}%</p>
          <p><strong>New Content Discovered:</strong> ${reportData.newContent}</p>
          <p><strong>Top Performing Query:</strong> ${reportData.topQuery}</p>
        </div>

        <div style="background: #ecfdf5; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <h3>Ranking Changes</h3>
          <p><strong>Improved Rankings:</strong> ${reportData.improved}</p>
          <p><strong>Declined Rankings:</strong> ${reportData.declined}</p>
          <p><strong>Stable Rankings:</strong> ${reportData.stable}</p>
        </div>

        <p>View detailed analytics in your <a href="${process.env.NEXT_PUBLIC_APP_URL}/analytics" style="color: #2563eb;">dashboard</a>.</p>
      </div>
    `

    await this.sendEmail({
      to: userEmail,
      subject: "Weekly Ranking Performance Report",
      html,
    })
  }
}

export const emailService = new EmailService()
