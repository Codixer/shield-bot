import { ButtonInteraction } from "discord.js";

interface StoredInteraction {
  interaction: ButtonInteraction;
  expiresAt: number; // Timestamp when interaction expires (15 minutes)
  discordId: string;
  vrcUserId: string;
}

/**
 * Manages stored interactions for verification messages
 * Interactions are valid for 15 minutes after creation
 */
export class VerificationInteractionManager {
  private static readonly INTERACTION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  private static interactions: Map<string, StoredInteraction> = new Map();
  private static cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Store an interaction for later use
   * @param discordId Discord user ID
   * @param vrcUserId VRChat user ID
   * @param interaction The interaction to store
   */
  static storeInteraction(
    discordId: string,
    vrcUserId: string,
    interaction: ButtonInteraction,
  ): void {
    const key = this.getKey(discordId, vrcUserId);
    const expiresAt = Date.now() + this.INTERACTION_TIMEOUT_MS;

    this.interactions.set(key, {
      interaction,
      expiresAt,
      discordId,
      vrcUserId,
    });

    // Start cleanup interval if not already running
    if (!this.cleanupInterval) {
      this.startCleanupInterval();
    }
  }

  /**
   * Get a stored interaction if it exists and hasn't expired
   * @param discordId Discord user ID
   * @param vrcUserId VRChat user ID
   * @returns The interaction if valid, null otherwise
   */
  static getInteraction(
    discordId: string,
    vrcUserId: string,
  ): ButtonInteraction | null {
    const key = this.getKey(discordId, vrcUserId);
    const stored = this.interactions.get(key);

    if (!stored) {
      return null;
    }

    // Check if expired
    if (Date.now() > stored.expiresAt) {
      this.interactions.delete(key);
      return null;
    }

    return stored.interaction;
  }

  /**
   * Remove a stored interaction
   * @param discordId Discord user ID
   * @param vrcUserId VRChat user ID
   */
  static removeInteraction(discordId: string, vrcUserId: string): void {
    const key = this.getKey(discordId, vrcUserId);
    this.interactions.delete(key);
  }

  /**
   * Clean up expired interactions
   */
  static cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, stored] of this.interactions.entries()) {
      if (now > stored.expiresAt) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.interactions.delete(key);
    }

    // Stop cleanup interval if no interactions left
    if (this.interactions.size === 0 && this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Start the cleanup interval (runs every minute)
   */
  private static startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000); // Run every minute
  }

  /**
   * Generate a unique key for storing interactions
   */
  private static getKey(discordId: string, vrcUserId: string): string {
    return `${discordId}:${vrcUserId}`;
  }

  /**
   * Get the number of stored interactions (for debugging)
   */
  static getStoredCount(): number {
    return this.interactions.size;
  }
}

