// app/services/scheduler-service.ts
import cron, { ScheduledTask } from 'node-cron'
import { useQueriesStore } from '@/app/store'

export class SchedulerService {
  private static instance: SchedulerService
  private isRunning = false
  private task: ScheduledTask | null = null

  static getInstance(): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService()
    }
    return SchedulerService.instance
  }

  async start() {
    if (this.isRunning) return { success: true, message: 'Already running' }
    
    console.log('[Scheduler] Starting scheduler...')
    
    // Check every 30 minutes for due queries
    this.task = cron.schedule('*/30 * * * *', async () => {
      await this.processScheduledQueries()
    })
    
    this.isRunning = true
    return { success: true, message: 'Scheduler started' }
  }

  stop() {
    if (this.task) {
      this.task.stop()
      this.task = null
    }
    this.isRunning = false
    return { success: true, message: 'Scheduler stopped' }
  }

  private async processScheduledQueries() {
    try {
      console.log('[Scheduler] Processing scheduled queries...')
      
      // Use your store's getDueQueries method
      const store = useQueriesStore.getState()
      const dueQueries = await store.getDueQueries()
      
      if (dueQueries.length === 0) {
        console.log('[Scheduler] No queries due for execution')
        return
      }

      console.log(`[Scheduler] Running ${dueQueries.length} due queries`)
      
      // Use your store's batchRunQueries method
      const results = await store.batchRunQueries(dueQueries.map(q => q.id))
      
      const successCount = results.filter(r => r.status === 'success').length
      const errorCount = results.filter(r => r.status === 'error').length
      
      console.log(`[Scheduler] Completed: ${successCount} success, ${errorCount} errors`)
    } catch (error) {
      console.error('[Scheduler] Error processing queries:', error)
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      hasTask: !!this.task
    }
  }
}

// Export singleton
export const schedulerService = SchedulerService.getInstance()
