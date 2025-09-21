/**
 * Centralized logging utility for the application
 * Replaces console.log, console.info, console.debug, console.error with a unified interface
 */

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  tag: string;
  message: string;
  data?: any;
}

export class LogClass {
  private static instance: LogClass;
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000; // Keep last 1000 logs in memory
  private currentLevel: LogLevel = LogLevel.DEBUG;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance of LogClass
   */
  public static getInstance(): LogClass {
    if (!LogClass.instance) {
      LogClass.instance = new LogClass();
    }
    return LogClass.instance;
  }

  /**
   * Set the minimum log level to display
   */
  public setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  /**
   * Get all logs
   */
  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Clear all logs
   */
  public clearLogs(): void {
    this.logs = [];
  }

  /**
   * Get logs by tag
   */
  public getLogsByTag(tag: string): LogEntry[] {
    return this.logs.filter(log => log.tag === tag);
  }

  /**
   * Get logs by level
   */
  public getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Internal method to add log entry
   */
  private addLog(level: LogLevel, tag: string, message: string, data?: any): void {
    // Only log if level is above current threshold
    if (level < this.currentLevel) {
      return;
    }

    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      tag,
      message,
      data
    };

    // Add to internal logs
    this.logs.push(logEntry);

    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also output to console in development
    if (process.env.NODE_ENV === 'development') {
      const timestamp = logEntry.timestamp.toISOString();
      const levelName = LogLevel[level];
      const prefix = `[${timestamp}] [${levelName}] [${tag}]`;

      switch (level) {
        case LogLevel.DEBUG:
          console.debug(prefix, message, data || '');
          break;
        case LogLevel.INFO:
          console.info(prefix, message, data || '');
          break;
        case LogLevel.WARN:
          console.warn(prefix, message, data || '');
          break;
        case LogLevel.ERROR:
          console.error(prefix, message, data || '');
          break;
      }
    }
  }

  /**
   * Log debug message
   */
  public Debug(tag: string, message: string, data?: any): void {
    this.addLog(LogLevel.DEBUG, tag, message, data);
  }

  /**
   * Log info message
   */
  public Info(tag: string, message: string, data?: any): void {
    this.addLog(LogLevel.INFO, tag, message, data);
  }

  /**
   * Log warning message
   */
  public Warn(tag: string, message: string, data?: any): void {
    this.addLog(LogLevel.WARN, tag, message, data);
  }

  /**
   * Log error message
   */
  public Error(tag: string, message: string, data?: any): void {
    this.addLog(LogLevel.ERROR, tag, message, data);
  }

  /**
   * Log with automatic tag detection (for classes)
   */
  public log(instance: any, level: LogLevel, message: string, data?: any): void {
    const tag = instance.constructor?.name || 'Unknown';
    this.addLog(level, tag, message, data);
  }

  /**
   * Convenience methods for classes
   */
  public DebugClass(instance: any, message: string, data?: any): void {
    this.log(instance, LogLevel.DEBUG, message, data);
  }

  public InfoClass(instance: any, message: string, data?: any): void {
    this.log(instance, LogLevel.INFO, message, data);
  }

  public WarnClass(instance: any, message: string, data?: any): void {
    this.log(instance, LogLevel.WARN, message, data);
  }

  public ErrorClass(instance: any, message: string, data?: any): void {
    this.log(instance, LogLevel.ERROR, message, data);
  }
}

// Export singleton instance for easy use
export const Log = LogClass.getInstance();
