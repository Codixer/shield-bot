/**
 * Application constants
 * Centralized location for magic numbers and configuration values
 */

/**
 * Discord embed colors
 */
export const DiscordColors = {
  SUCCESS: 0x57f287, // Green
  ERROR: 0xed4245, // Red
  WARNING: 0xfee75c, // Yellow
  INFO: 0x5865f2, // Blurple
  DEFAULT: 0x2f3136, // Dark gray
} as const;

/**
 * Time constants (in milliseconds)
 */
export const TimeConstants = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Exception handling constants
 */
export const ExceptionConstants = {
  MAX_UNCAUGHT_EXCEPTIONS: 5,
  EXCEPTION_RESET_TIME: 60 * 1000, // 1 minute
} as const;

/**
 * Verification constants
 */
export const VerificationConstants = {
  VERIFICATION_CODE_LENGTH: 6,
  USERNAME_CACHE_TTL: 7 * 24 * 60 * 60 * 1000, // 1 week
} as const;

/**
 * Whitelist constants
 */
export const WhitelistConstants = {
  BATCH_DELAY_MS: 5000, // Wait 5 seconds after last change before updating
  DEFAULT_XOR_KEY: "SHIELD_WHITELIST_KEY_9302025",
} as const;

/**
 * API constants
 */
export const ApiConstants = {
  DEFAULT_PORT: 3000,
  MAX_PORT: 65535,
  MIN_PORT: 1,
} as const;

/**
 * Rate limiting constants
 */
export const RateLimitConstants = {
  DEFAULT_TIMEOUT: 1000,
} as const;

/**
 * WebSocket reconnection constants
 */
export const WebSocketConstants = {
  INITIAL_RECONNECT_DELAY: 1000, // 1 second
  MAX_RECONNECT_DELAY: 60000, // 60 seconds
  RECONNECT_DELAY_MULTIPLIER: 2, // Exponential backoff multiplier
  MAX_RECONNECT_ATTEMPTS: Infinity, // Retry indefinitely (or set to a number for max attempts)
} as const;

