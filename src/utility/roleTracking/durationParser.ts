/**
 * Parse human-readable duration strings to milliseconds
 * Supports formats like "1 week", "2 weeks", "1 month", "30 days", etc.
 */

/**
 * Parse a duration string to milliseconds
 * @param durationString - Duration string (e.g., "1 week", "2 months", "30 days")
 * @returns Duration in milliseconds, or null if invalid
 */
export function parseDurationToMs(durationString: string): number | null {
  const normalized = durationString.trim().toLowerCase();

  // Match patterns like "2 weeks", "2w", "14 days", "14d", "1 month", "1mo"
  const patterns = [
    // Weeks
    { regex: /^(\d+)\s*(?:weeks?|w)$/, multiplier: 7 * 24 * 60 * 60 * 1000 },
    // Days
    { regex: /^(\d+)\s*(?:days?|d)$/, multiplier: 24 * 60 * 60 * 1000 },
    // Months (approximate, 30 days)
    { regex: /^(\d+)\s*(?:months?|mo)$/, multiplier: 30 * 24 * 60 * 60 * 1000 },
    // Years (approximate, 365 days)
    { regex: /^(\d+)\s*(?:years?|y)$/, multiplier: 365 * 24 * 60 * 60 * 1000 },
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern.regex);
    if (match) {
      const value = parseInt(match[1], 10);
      if (value <= 0) {
        return null;
      }
      return value * pattern.multiplier;
    }
  }

  return null;
}

/**
 * Check if a duration string is valid
 * @param durationString - Duration string to validate
 * @returns True if valid, false otherwise
 */
export function isValidDuration(durationString: string): boolean {
  return parseDurationToMs(durationString) !== null;
}

/**
 * Convert milliseconds to a human-readable duration string
 * @param ms - Milliseconds
 * @returns Human-readable string (e.g., "2 weeks", "30 days")
 */
export function msToDurationString(ms: number): string {
  if (ms < 0) {
    return "0 days";
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
  return "0 days";
}
