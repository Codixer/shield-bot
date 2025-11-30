/**
 * Centralized logging utility
 * Provides structured logging with levels, prefixes, and consistent formatting
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  level: LogLevel;
  prefix: string;
  message: string;
  data?: unknown;
  error?: Error;
  timestamp: Date;
}

class Logger {
  private minLevel: LogLevel = LogLevel.INFO;
  private enabled: boolean = true;

  /**
   * Set the minimum log level
   * Messages below this level will not be logged
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Enable or disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Format log entry for output
   */
  private formatEntry(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const levelName = LogLevel[entry.level];
    const prefix = entry.prefix ? `[${entry.prefix}]` : "";
    const parts = [timestamp, levelName, prefix, entry.message].filter(Boolean);

    let output = parts.join(" ");

    if (entry.data) {
      output += `\n  Data: ${JSON.stringify(entry.data, null, 2)}`;
    }

    if (entry.error) {
      output += `\n  Error: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\n  Stack: ${entry.error.stack}`;
      }
    }

    return output;
  }

  /**
   * Write log entry to console
   */
  private write(entry: LogEntry): void {
    if (!this.enabled || entry.level < this.minLevel) {
      return;
    }

    const formatted = this.formatEntry(entry);

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(formatted);
        break;
      case LogLevel.INFO:
        console.info(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
        console.error(formatted);
        break;
    }
  }

  /**
   * Log a debug message
   */
  debug(prefix: string, message: string, data?: unknown): void {
    this.write({
      level: LogLevel.DEBUG,
      prefix,
      message,
      data,
      timestamp: new Date(),
    });
  }

  /**
   * Log an info message
   */
  info(prefix: string, message: string, data?: unknown): void {
    this.write({
      level: LogLevel.INFO,
      prefix,
      message,
      data,
      timestamp: new Date(),
    });
  }

  /**
   * Log a warning message
   */
  warn(prefix: string, message: string, data?: unknown): void {
    this.write({
      level: LogLevel.WARN,
      prefix,
      message,
      data,
      timestamp: new Date(),
    });
  }

  /**
   * Log an error message
   */
  error(
    prefix: string,
    message: string,
    error?: Error | unknown,
    data?: unknown,
  ): void {
    const err = error instanceof Error ? error : undefined;
    this.write({
      level: LogLevel.ERROR,
      prefix,
      message,
      error: err,
      data: err ? data : error || data,
      timestamp: new Date(),
    });
  }
}

// Singleton logger instance
export const logger = new Logger();

// Convenience functions for common prefixes
export const loggers = {
  bot: {
    debug: (message: string, data?: unknown) =>
      logger.debug("Bot", message, data),
    info: (message: string, data?: unknown) =>
      logger.info("Bot", message, data),
    warn: (message: string, data?: unknown) =>
      logger.warn("Bot", message, data),
    error: (message: string, error?: Error | unknown, data?: unknown) =>
      logger.error("Bot", message, error, data),
  },
  vrchat: {
    debug: (message: string, data?: unknown) =>
      logger.debug("VRChat", message, data),
    info: (message: string, data?: unknown) =>
      logger.info("VRChat", message, data),
    warn: (message: string, data?: unknown) =>
      logger.warn("VRChat", message, data),
    error: (message: string, error?: Error | unknown, data?: unknown) =>
      logger.error("VRChat", message, error, data),
  },
  database: {
    debug: (message: string, data?: unknown) =>
      logger.debug("Database", message, data),
    info: (message: string, data?: unknown) =>
      logger.info("Database", message, data),
    warn: (message: string, data?: unknown) =>
      logger.warn("Database", message, data),
    error: (message: string, error?: Error | unknown, data?: unknown) =>
      logger.error("Database", message, error, data),
  },
  schedules: {
    debug: (message: string, data?: unknown) =>
      logger.debug("Schedules", message, data),
    info: (message: string, data?: unknown) =>
      logger.info("Schedules", message, data),
    warn: (message: string, data?: unknown) =>
      logger.warn("Schedules", message, data),
    error: (message: string, error?: Error | unknown, data?: unknown) =>
      logger.error("Schedules", message, error, data),
  },
  patrol: {
    debug: (message: string, data?: unknown) =>
      logger.debug("PatrolTimer", message, data),
    info: (message: string, data?: unknown) =>
      logger.info("PatrolTimer", message, data),
    warn: (message: string, data?: unknown) =>
      logger.warn("PatrolTimer", message, data),
    error: (message: string, error?: Error | unknown, data?: unknown) =>
      logger.error("PatrolTimer", message, error, data),
  },
  shutdown: {
    debug: (message: string, data?: unknown) =>
      logger.debug("Shutdown", message, data),
    info: (message: string, data?: unknown) =>
      logger.info("Shutdown", message, data),
    warn: (message: string, data?: unknown) =>
      logger.warn("Shutdown", message, data),
    error: (message: string, error?: Error | unknown, data?: unknown) =>
      logger.error("Shutdown", message, error, data),
  },
  startup: {
    debug: (message: string, data?: unknown) =>
      logger.debug("Startup", message, data),
    info: (message: string, data?: unknown) =>
      logger.info("Startup", message, data),
    warn: (message: string, data?: unknown) =>
      logger.warn("Startup", message, data),
    error: (message: string, error?: Error | unknown, data?: unknown) =>
      logger.error("Startup", message, error, data),
  },
};

