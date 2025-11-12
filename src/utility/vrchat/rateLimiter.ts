// Rate-limited VRChat API fetch wrapper with 429 handling

import fetch, { RequestInit, Response } from "node-fetch";

interface RateLimitConfig {
  maxRetries: number;
  baseDelay: number; // Base delay in ms
  maxDelay: number; // Maximum delay in ms
}

interface QueuedRequest {
  url: string;
  options: RequestInit;
  resolve: (value: Response) => void;
  reject: (reason: any) => void;
  retries: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRetries: 3,
  baseDelay: 1000, // Start with 1 second
  maxDelay: 60000, // Max 60 seconds
};

class VRChatRateLimiter {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private lastRequestTime = 0;
  private minRequestInterval = 100; // Minimum 100ms between requests
  private currentDelay = 0; // Current delay for 429 backoff

  /**
   * Make a rate-limited fetch request to VRChat API
   * Automatically handles 429 responses with exponential backoff
   */
  async fetch(
    url: string,
    options: RequestInit = {},
    config: RateLimitConfig = DEFAULT_CONFIG,
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        url,
        options,
        resolve,
        reject,
        retries: 0,
      });

      if (!this.processing) {
        this.processQueue(config);
      }
    });
  }

  private async processQueue(config: RateLimitConfig): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift()!;

      try {
        // Wait for minimum interval between requests
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const waitTime = Math.max(
          this.minRequestInterval - timeSinceLastRequest,
          this.currentDelay,
        );

        if (waitTime > 0) {
          await this.sleep(waitTime);
        }

        this.lastRequestTime = Date.now();

        // Make the request
        const response = await fetch(request.url, request.options);

        // Handle 429 Too Many Requests
        if (response.status === 429) {
          const retryAfter = this.getRetryAfter(response);

          if (request.retries < config.maxRetries) {
            const delay = Math.min(
              retryAfter || config.baseDelay * Math.pow(2, request.retries),
              config.maxDelay,
            );

            console.warn(
              `[VRChat API] Rate limited (429). Retrying after ${delay}ms (attempt ${request.retries + 1}/${config.maxRetries})`,
            );

            // Set current delay for subsequent requests
            this.currentDelay = delay;

            // Re-queue the request with incremented retry count
            request.retries++;
            this.queue.unshift(request);

            // Wait before processing next request
            await this.sleep(delay);

            // Reset current delay after waiting
            this.currentDelay = 0;
            continue;
          } else {
            // Max retries exceeded
            const error = new Error(
              `VRChat API rate limit exceeded. Max retries (${config.maxRetries}) reached.`,
            );
            request.reject(error);
            continue;
          }
        }

        // Handle other error responses
        if (!response.ok && response.status >= 500) {
          // Server error - retry with exponential backoff
          if (request.retries < config.maxRetries) {
            const delay = Math.min(
              config.baseDelay * Math.pow(2, request.retries),
              config.maxDelay,
            );

            console.warn(
              `[VRChat API] Server error (${response.status}). Retrying after ${delay}ms (attempt ${request.retries + 1}/${config.maxRetries})`,
            );

            request.retries++;
            this.queue.unshift(request);
            await this.sleep(delay);
            continue;
          }
        }

        // Success or non-retryable error
        request.resolve(response);
      } catch (error: any) {
        // Network error or other exception
        if (request.retries < config.maxRetries) {
          const delay = Math.min(
            config.baseDelay * Math.pow(2, request.retries),
            config.maxDelay,
          );

          console.warn(
            `[VRChat API] Request failed: ${error.message}. Retrying after ${delay}ms (attempt ${request.retries + 1}/${config.maxRetries})`,
          );

          request.retries++;
          this.queue.unshift(request);
          await this.sleep(delay);
          continue;
        } else {
          request.reject(error);
        }
      }
    }

    this.processing = false;
  }

  /**
   * Extract Retry-After header from 429 response
   * Returns delay in milliseconds, or null if not present
   */
  private getRetryAfter(response: Response): number | null {
    const retryAfter = response.headers.get("retry-after");
    if (!retryAfter) {
      return null;
    }

    // Retry-After can be either seconds or HTTP date
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000; // Convert to milliseconds
    }

    // Try parsing as HTTP date
    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
      return Math.max(0, date.getTime() - Date.now());
    }

    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current queue length (for monitoring)
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Check if rate limiter is currently processing
   */
  isProcessing(): boolean {
    return this.processing;
  }
}

// Export singleton instance
export const vrchatRateLimiter = new VRChatRateLimiter();

/**
 * Rate-limited fetch wrapper for VRChat API
 * Automatically handles 429 responses with exponential backoff and retry logic
 *
 * @param url The URL to fetch
 * @param options Fetch options (headers, method, body, etc.)
 * @param config Rate limit configuration (optional)
 * @returns Promise resolving to the fetch Response
 */
export async function vrchatFetch(
  url: string,
  options: RequestInit = {},
  config?: RateLimitConfig,
): Promise<Response> {
  return vrchatRateLimiter.fetch(url, options, config);
}
