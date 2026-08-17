import type { IDetectorLogger, LogLevel } from "./types"

export class StructuredDetectorLogger implements IDetectorLogger {
  private static readonly LEVELS: Record<LogLevel, number> = {
    debug: 0, info: 1, warn: 2, error: 3,
  }

  constructor(
    private readonly context = "AlgorithmDetector",
    private readonly minLevel: LogLevel = "info"
  ) {}

  private log(level: LogLevel, category: string, message: string, data?: Record<string, unknown>): void {
    if (StructuredDetectorLogger.LEVELS[level] < StructuredDetectorLogger.LEVELS[this.minLevel]) return
    const entry = { level, category, message, data, timestamp: new Date().toISOString() }
    const prefix = `[${this.context}:${category}]`
    switch (level) {
      case "debug": console.debug(prefix, entry); break
      case "info": console.info(prefix, entry); break
      case "warn": console.warn(prefix, entry); break
      case "error": console.error(prefix, entry); break
    }
  }

  debug(c: string, m: string, d?: Record<string, unknown>): void { this.log("debug", c, m, d) }
  info(c: string, m: string, d?: Record<string, unknown>): void { this.log("info", c, m, d) }
  warn(c: string, m: string, d?: Record<string, unknown>): void { this.log("warn", c, m, d) }
  error(c: string, m: string, d?: Record<string, unknown>): void { this.log("error", c, m, d) }
}

export class SilentLogger implements IDetectorLogger {
  debug(_c: string, _m: string, _d?: Record<string, unknown>): void {}
  info(_c: string, _m: string, _d?: Record<string, unknown>): void {}
  warn(_c: string, _m: string, _d?: Record<string, unknown>): void {}
  error(_c: string, _m: string, _d?: Record<string, unknown>): void {}
}
