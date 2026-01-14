/**
 * Parse relative time strings and convert to Date objects
 * Supports formats like "2 weeks", "14 days", "1 month", etc.
 */

export interface ParseTimeResult {
  success: boolean;
  endDate?: Date;
  error?: string;
}

/**
 * Parse a relative time string and return the end date
 * @param timeString - Relative time string (e.g., "2 weeks", "14 days", "1 month")
 * @param startDate - Optional start date (defaults to now)
 * @returns ParseTimeResult with endDate or error
 */
export function parseRelativeTime(
  timeString: string,
  startDate: Date = new Date(),
): ParseTimeResult {
  const normalized = timeString.trim().toLowerCase();

  // Match patterns like "2 weeks", "2w", "14 days", "14d", "1 month", "1mo"
  // Note: This parser only supports day-or-longer durations (minutes/seconds are intentionally unsupported)
  const patterns = [
    // Weeks
    { regex: /^(\d+)\s*(?:weeks?|w)$/, multiplier: 7 * 24 * 60 * 60 * 1000 },
    // Days
    { regex: /^(\d+)\s*(?:days?|d)$/, multiplier: 24 * 60 * 60 * 1000 },
    // Months (approximate, 30 days) - using "mo" to avoid ambiguity with minutes
    { regex: /^(\d+)\s*(?:months?|mo)$/, multiplier: 30 * 24 * 60 * 60 * 1000 },
    // Years (approximate, 365 days)
    { regex: /^(\d+)\s*(?:years?|y)$/, multiplier: 365 * 24 * 60 * 60 * 1000 },
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern.regex);
    if (match) {
      const value = parseInt(match[1], 10);
      if (value <= 0) {
        return {
          success: false,
          error: "Time value must be greater than 0",
        };
      }

      const milliseconds = value * pattern.multiplier;
      const endDate = new Date(startDate.getTime() + milliseconds);

      return {
        success: true,
        endDate,
      };
    }
  }

  return {
    success: false,
    error: `Invalid time format: "${timeString}". Supported formats: "2 weeks", "14 days", "1 month", etc.`,
  };
}

/**
 * Format a duration in milliseconds to a human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 0) {
    throw new RangeError(`Invalid duration: ${ms}ms. Duration must be non-negative.`);
  }

  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) {
    return `${years} ${years === 1 ? "year" : "years"}`;
  }
  if (months > 0) {
    return `${months} ${months === 1 ? "month" : "months"}`;
  }
  if (weeks > 0) {
    return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  }
  if (days > 0) {
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  return "less than a day";
}
