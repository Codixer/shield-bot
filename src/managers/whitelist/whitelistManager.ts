import { purgeCloudflareCache } from "../../utility/cloudflare/purgeCache.js";
import { prisma } from "../../main.js";
import { bot } from "../../main.js";
import { WhitelistUserOperations } from "./userOperations.js";
import { WhitelistRoleOperations } from "./roleOperations.js";
import { WhitelistGeneration } from "./whitelistGeneration.js";
import { GitHubPublisher } from "./githubPublisher.js";
import { DiscordSync } from "./discordSync.js";
import { loggers } from "../../utility/logger.js";

/**
 * Main whitelist manager that orchestrates all whitelist operations
 */
export class WhitelistManager {
  // Batching mechanism for GitHub updates
  private pendingUpdates: Set<string> = new Set();
  private updateTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_DELAY_MS = 5000; // Wait 5 seconds after last change before updating
  private lastPublishedContent: string | null = null;
  private _lastUpdateTimestamp: number | null = null;
  public get lastUpdateTimestamp(): number | null {
    return this._lastUpdateTimestamp;
  }

  // Module instances
  private userOps: WhitelistUserOperations;
  private roleOps: WhitelistRoleOperations;
  private generation: WhitelistGeneration;
  private githubPublisher: GitHubPublisher;
  private discordSync: DiscordSync;

  constructor() {
    this.userOps = new WhitelistUserOperations();
    this.roleOps = new WhitelistRoleOperations();
    this.generation = new WhitelistGeneration();
    this.githubPublisher = new GitHubPublisher();
    this.discordSync = new DiscordSync();
  }

  // ========== User Operations ==========
  async getUserByDiscordId(discordId: string) {
    return this.userOps.getUserByDiscordId(discordId);
  }

  async getUserByVrcUserId(vrcUserId: string) {
    return this.userOps.getUserByVrcUserId(vrcUserId);
  }

  async addUserByDiscordId(discordId: string): Promise<unknown> {
    return this.userOps.addUserByDiscordId(discordId);
  }

  async addUserByVrcUsername(vrchatUsername: string): Promise<unknown> {
    return this.userOps.addUserByVrcUsername(vrchatUsername);
  }

  async removeUserByDiscordId(discordId: string): Promise<boolean> {
    return this.userOps.removeUserByDiscordId(discordId);
  }

  async removeUserByVrcUserId(vrcUserId: string): Promise<boolean> {
    return this.userOps.removeUserByVrcUserId(vrcUserId);
  }

  async addUserByVrcUserId(vrcUserId: string): Promise<unknown> {
    return this.userOps.addUserByVrcUserId(vrcUserId);
  }

  async removeUserFromWhitelistIfNoRoles(discordId: string): Promise<void> {
    return this.userOps.removeUserFromWhitelistIfNoRoles(discordId);
  }

  async getUserWhitelistRoles(discordId: string): Promise<string[]> {
    return this.userOps.getUserWhitelistRoles(discordId);
  }

  // ========== Role Operations ==========
  async createRole(
    guildId: string,
    permissions?: string,
    discordRoleId?: string,
  ): Promise<unknown> {
    return this.roleOps.createRole(guildId, permissions, discordRoleId);
  }

  async deleteRole(guildId: string, discordRoleId: string): Promise<boolean> {
    return this.roleOps.deleteRole(guildId, discordRoleId);
  }

  async assignRoleByDiscordId(
    discordId: string,
    roleId: number,
    assignedBy?: string,
    expiresAt?: Date,
  ): Promise<unknown> {
    return this.roleOps.assignRoleByDiscordId(discordId, roleId, assignedBy, expiresAt);
  }

  async removeRoleByDiscordId(
    discordId: string,
    roleId: number,
  ): Promise<boolean> {
    return this.roleOps.removeRoleByDiscordId(discordId, roleId);
  }

  async getAllRoles(): Promise<unknown[]> {
    return this.roleOps.getAllRoles();
  }

  async setupDiscordRoleMapping(
    discordRoleId: string,
    guildId: string,
    permissions: string[],
  ): Promise<unknown> {
    return this.roleOps.setupDiscordRoleMapping(discordRoleId, guildId, permissions);
  }

  async getDiscordRoleMappings(guildId?: string): Promise<unknown[]> {
    return this.roleOps.getDiscordRoleMappings(guildId);
  }

  async shouldUserBeWhitelisted(discordRoleIds: string[], guildId?: string): Promise<boolean> {
    return this.roleOps.shouldUserBeWhitelisted(discordRoleIds, guildId);
  }

  async cleanupExpiredRoles(): Promise<number> {
    return this.roleOps.cleanupExpiredRoles();
  }

  async assignRoleByVrcUserId(
    vrcUserId: string,
    roleId: number,
    assignedBy?: string,
    expiresAt?: Date,
  ): Promise<unknown> {
    return this.roleOps.assignRoleByVrcUserId(
      vrcUserId,
      roleId,
      (vrcUserId: string) => this.userOps.getUserByVrcUserId(vrcUserId),
      assignedBy,
      expiresAt,
    );
  }

  // ========== Whitelist Generation ==========
  async getWhitelistUsers(guildId?: string): Promise<unknown[]> {
    return this.generation.getWhitelistUsers(guildId);
  }

  async generateWhitelistContent(guildId?: string): Promise<string> {
    return this.generation.generateWhitelistContent(guildId);
  }

  async generateEncodedWhitelist(guildId?: string): Promise<string> {
    return this.generation.generateEncodedWhitelist(guildId);
  }

  // ========== GitHub Publishing ==========
  /**
   * Publish the whitelist to the configured GitHub repository.
   * Writes both encoded and decoded files in a single commit.
   * Now checks if content changed before publishing to avoid unnecessary commits.
   */
  async publishWhitelist(commitMessage?: string, force: boolean = false, guildId?: string): Promise<{
    updated: boolean;
    commitSha?: string;
    paths?: string[];
    branch?: string;
    reason?: string;
  }> {
    // Generate content to check if it changed
    const currentContent = await this.generation.generateWhitelistContent();

    // Skip update if content hasn't changed (unless forced)
    if (!force && this.lastPublishedContent !== null && currentContent === this.lastPublishedContent) {
      loggers.bot.debug('Content unchanged, skipping GitHub update');
      return { updated: false, reason: 'Content unchanged' };
    }

    const [encodedData, decodedData] = await Promise.all([
      this.generation.generateEncodedWhitelist(),
      this.generation.generateWhitelistContent(),
    ]);

    const result = await this.githubPublisher.updateRepositoryWithWhitelist(
      encodedData,
      decodedData,
      commitMessage,
    );

    // Store the published content for future comparisons
    if (result.updated) {
      this.lastPublishedContent = currentContent;
      this._lastUpdateTimestamp = Date.now();
      // Purge Cloudflare cache for this guild's whitelist URLs
      const zoneId = process.env.CLOUDFLARE_ZONE_ID ?? "";
      const apiToken = process.env.CLOUDFLARE_API_TOKEN ?? "";
      
      if (zoneId && apiToken) {
        try {
          const targetGuildIds = guildId ? [guildId] : ["813926536457224212"];
          for (const gid of targetGuildIds) {
            const urls = [
              `https://api.vrcshield.com/api/vrchat/${gid}/whitelist/encoded`,
              `https://api.vrcshield.com/api/vrchat/${gid}/whitelist/raw`,
              `https://api.vrcshield.com/api/vrchat/whitelist/encoded`
            ];
            await purgeCloudflareCache(zoneId, apiToken, urls);
            loggers.bot.info(`Purged Cloudflare cache for guild ${gid}`);
          }
        } catch (err) {
          loggers.bot.warn(`Cloudflare purge failed`, err);
        }
      } else {
        loggers.bot.debug(`Cloudflare cache purge skipped - missing zone ID or API token`);
      }
    }
    return result;
  }

  /**
   * Queue a user for batched whitelist update
   * This collects changes and publishes once after a delay
   */
  queueBatchedUpdate(discordId: string, commitMessage?: string): void {
    this.pendingUpdates.add(discordId);

    // Clear existing timer and start a new one
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    this.updateTimer = setTimeout(async () => {
      await this.processBatchedUpdates(commitMessage);
    }, this.BATCH_DELAY_MS);
  }

  /**
   * Check if any of the updated users have rooftop permissions
   */
  private async checkForRooftopPermissionChanges(
    discordIds: string[],
  ): Promise<boolean> {
    try {
      const rooftopPermissions = [
        "rooftop_announce",
        "rooftop_bouncer",
        "rooftop_staff",
        "rooftop_vip",
        "rooftop_vipplus",
      ];

      const entries = await prisma.whitelistEntry.findMany({
        where: {
          user: {
            discordId: {
              in: discordIds,
            },
          },
        },
        select: {
          roleAssignments: {
            where: {
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            select: {
              role: {
                select: {
                  permissions: true,
                },
              },
            },
          },
        },
      });

      for (const entry of entries) {
        for (const assignment of entry.roleAssignments) {
          if (assignment.role.permissions) {
            const permissionList = assignment.role.permissions
              .split(",")
              .map((p: string) => p.trim());
            if (
              rooftopPermissions.some((rooftopPerm) =>
                permissionList.includes(rooftopPerm),
              )
            ) {
              return true;
            }
          }
        }
      }
      return false;
    } catch (error) {
      loggers.bot.warn("Error checking for rooftop permission changes", error);
      return false;
    }
  }

  /**
   * Process all pending batched updates
   */
  private async processBatchedUpdates(commitMessage?: string): Promise<void> {
    if (this.pendingUpdates.size === 0) {
      return;
    }

    const count = this.pendingUpdates.size;
    const users = Array.from(this.pendingUpdates);
    this.pendingUpdates.clear();
    this.updateTimer = null;

    loggers.bot.info(`Processing batched update for ${count} users`);

    try {
      // Generate a meaningful commit message if not provided
      let message = commitMessage;
      if (!message || message.trim().length === 0) {
        if (count === 1) {
          // Try to get the user's name for single updates
          try {
            const user = await this.userOps.getUserByDiscordId(users[0]);
            const name = (user as { vrchatAccounts?: Array<{ vrchatUsername?: string }> })?.vrchatAccounts?.[0]?.vrchatUsername || users[0];
            message = `Updated whitelist for ${name}`;
          } catch {
            message = `Updated whitelist for 1 user`;
          }
        } else {
          message = `Updated whitelist for ${count} users`;
        }
      }

      // Publish with content change check
      await this.publishWhitelist(message, false);

      // Check if any rooftop permissions were updated and publish rooftop files if needed
      const hasRooftopChanges = await this.checkForRooftopPermissionChanges(users);
      if (hasRooftopChanges) {
        loggers.bot.info("Rooftop permissions changed, updating rooftop files");
        try {
          await this.githubPublisher.updateRepositoryWithRooftopFiles(
            `chore(rooftop): update rooftop files after whitelist change`,
          );
        } catch (error) {
          loggers.bot.error("Error updating rooftop files", error);
        }
      }
    } catch (error) {
      loggers.bot.error('Error processing batched updates', error);
    }
  }

  // ========== Discord Sync ==========
  async syncUserRolesFromDiscord(
    discordId: string,
    discordRoleIds: string[],
    guildId?: string,
  ): Promise<void> {
    return this.discordSync.syncUserRolesFromDiscord(
      discordId,
      discordRoleIds,
      guildId,
      (discordId) => this.userOps.removeUserFromWhitelistIfNoRoles(discordId),
    );
  }

  async ensureUnverifiedAccountAccess(discordId: string): Promise<void> {
    return this.discordSync.ensureUnverifiedAccountAccess(
      discordId,
      (guildId) => this.roleOps.getDiscordRoleMappings(guildId),
      (discordId, botOverride) => this.syncAndPublishAfterVerification(discordId, botOverride),
    );
  }

  async syncAndPublishAfterVerification(
    discordId: string,
    botOverride?: unknown,
  ): Promise<void> {
    return this.discordSync.syncAndPublishAfterVerification(
      discordId,
      botOverride ?? bot,
      (guildId) => this.roleOps.getDiscordRoleMappings(guildId),
      (discordId, roleIds, guildId) => this.syncUserRolesFromDiscord(discordId, roleIds, guildId),
      (discordId) => this.userOps.getUserByDiscordId(discordId),
      (discordId) => this.userOps.getUserWhitelistRoles(discordId),
      (discordId, commitMessage) => this.queueBatchedUpdate(discordId, commitMessage),
    );
  }

  // ========== Statistics ==========
  /**
   * Get statistics
   */
  async getStatistics(): Promise<{
    totalUsers: number;
    totalRoles: number;
    totalActiveAssignments: number;
    totalExpiredAssignments: number;
  }> {
    const [
      totalUsers,
      totalRoles,
      totalActiveAssignments,
      totalExpiredAssignments,
    ] = await Promise.all([
      prisma.whitelistEntry.count(),
      prisma.whitelistRole.count(),
      prisma.whitelistRoleAssignment.count({
        where: {
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
      prisma.whitelistRoleAssignment.count({
        where: {
          expiresAt: { lte: new Date() },
        },
      }),
    ]);

    return {
      totalUsers,
      totalRoles,
      totalActiveAssignments,
      totalExpiredAssignments,
    };
  }

  // ========== API Compatibility Methods ==========
  /**
   * Get all whitelist entries (alias for API compatibility)
   */
  async getAllWhitelistEntries(): Promise<unknown[]> {
    return this.getWhitelistUsers();
  }

  /**
   * Bulk import users from CSV content
   */
  async bulkImportUsers(csvContent: string): Promise<{
    imported: number;
    errors: string[];
  }> {
    const lines = csvContent.split("\n").filter((line) => line.trim());
    const results = {
      imported: 0,
      errors: [] as string[],
    };

    for (const line of lines) {
      const [vrchatUsername, roleNames] = line.split(":");
      if (!vrchatUsername) {continue;}

      try {
        // Add user to whitelist
        await this.addUserByVrcUsername(vrchatUsername.trim());

        // Assign roles if specified
        if (roleNames) {
          const roles = roleNames.split(",").map((r) => r.trim());
          for (const roleName of roles) {
            try {
              // Note: This needs to be updated to use roleId instead of roleName
              // TODO: Look up role by Discord role ID or other identifier
              loggers.bot.warn(`Role assignment by name is deprecated: ${roleName}`);
            } catch (_error) {
              // Ignore role assignment errors for now
            }
          }
        }

        results.imported++;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.errors.push(`${vrchatUsername}: ${errorMessage}`);
      }
    }

    return results;
  }

  // ========== Cleanup ==========
  /**
   * Cleanup method to clear timers and pending operations
   */
  cleanup(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    // Process any pending updates before shutdown
    if (this.pendingUpdates.size > 0) {
      loggers.bot.info(`Processing ${this.pendingUpdates.size} pending updates before shutdown`);
      this.processBatchedUpdates("Shutdown cleanup").catch((err) => {
        loggers.bot.error("Error processing final updates", err);
      });
    }
  }
}

// Export instance
export const whitelistManager = new WhitelistManager();
