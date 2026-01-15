import {
  Client,
  EmbedBuilder,
  Colors,
  TextDisplayBuilder,
  ContainerBuilder,
  MessageFlags,
  TextChannel,
} from "discord.js";
import { prisma } from "../../main.js";
import { loggers } from "../../utility/logger.js";
import { parseDurationToMs, isValidDuration, msToDurationString } from "../../utility/roleTracking/durationParser.js";
import { patrolTimer } from "../../main.js";

export interface RoleTrackingConfig {
  enabled: boolean;
  roleName: string;
  deadlineDuration: string;
  patrolTimeThresholdHours?: number | null;
  warnings: Array<{
    index: number;
    offset: string;
    type: string;
    message: string;
  }>;
  staffPingOffset: string;
  staffPingMessage: string;
}

export interface RoleTrackingConfigMap {
  [roleId: string]: RoleTrackingConfig;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class RoleTrackingManager {
  private client: Client;
  private patrolTimer: typeof patrolTimer;

  constructor(client: Client, patrolTimerManager: typeof patrolTimer) {
    this.client = client;
    this.patrolTimer = patrolTimerManager;
  }

  /**
   * Get or create User by Discord ID and return the User ID
   */
  private async getUserIdFromDiscordId(discordId: string): Promise<number | null> {
    try {
      let user = await prisma.user.findUnique({
        where: { discordId },
      });

      if (!user) {
        // Create user if it doesn't exist
        user = await prisma.user.create({
          data: { discordId },
        });
      }

      return user.id;
    } catch (error) {
      loggers.bot.error(`Failed to get/create user for Discord ID ${discordId}`, error);
      return null;
    }
  }

  /**
   * Track when a user was assigned a tracked role
   */
  async trackRoleAssignment(
    guildId: string,
    discordId: string,
    roleId: string,
    assignedAt?: Date,
  ): Promise<void> {
    try {
      const userId = await this.getUserIdFromDiscordId(discordId);
      if (!userId) {
        loggers.bot.error(`Failed to get User ID for Discord ID ${discordId}`);
        return;
      }

      const assignmentDate = assignedAt || new Date();
      await prisma.roleAssignmentTracking.upsert({
        where: {
          guildId_userId_roleId: {
            guildId,
            userId,
            roleId,
          },
        },
        update: {
          assignedAt: assignmentDate,
          updatedAt: new Date(),
        },
        create: {
          guildId,
          userId,
          roleId,
          assignedAt: assignmentDate,
        },
      });
    } catch (error) {
      loggers.bot.error(
        `Failed to track role assignment for user ${discordId}, role ${roleId} in guild ${guildId}`,
        error,
      );
    }
  }

  /**
   * Track when a tracked role is removed
   */
  async trackRoleRemoval(_guildId: string, _userId: string, _roleId: string): Promise<void> {
    // Keep assignment record for historical purposes
    // The system will check if user still has the role before sending warnings
  }

  /**
   * Handle LOA role removal - reset all timers for this user
   */
  async handleLOARoleRemoval(guildId: string, discordId: string): Promise<void> {
    try {
      const userId = await this.getUserIdFromDiscordId(discordId);
      if (!userId) {
        loggers.bot.error(`Failed to get User ID for Discord ID ${discordId}`);
        return;
      }

      const now = new Date();
      await prisma.roleAssignmentTracking.updateMany({
        where: {
          guildId,
          userId,
        },
        data: {
          assignedAt: now,
          updatedAt: now,
        },
      });
      loggers.bot.info(
        `Reset all role assignment timers for user ${discordId} in guild ${guildId} due to LOA removal`,
      );
    } catch (error) {
      loggers.bot.error(
        `Failed to reset role assignment timers for user ${discordId} in guild ${guildId}`,
        error,
      );
    }
  }

  /**
   * Get role assignment date, or system init date if no record exists
   */
  async getRoleAssignmentDate(
    guildId: string,
    discordId: string,
    roleId: string,
    systemInitDate: Date,
  ): Promise<Date> {
    const userId = await this.getUserIdFromDiscordId(discordId);
    if (!userId) {
      return systemInitDate;
    }

    const tracking = await prisma.roleAssignmentTracking.findUnique({
      where: {
        guildId_userId_roleId: {
          guildId,
          userId,
          roleId,
        },
      },
    });

    if (tracking) {
      return tracking.assignedAt;
    }

    // No record exists (existing user when system was first enabled)
    return systemInitDate;
  }

  /**
   * Check if user has LOA role
   */
  async hasLOARole(guildId: string, userId: string): Promise<boolean> {
    try {
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId },
        select: { loaRoleId: true },
      });

      if (!settings?.loaRoleId) {
        return false;
      }

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        return false;
      }

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        return false;
      }

      return member.roles.cache.has(settings.loaRoleId);
    } catch (error) {
      loggers.bot.error(`Failed to check LOA role for user ${userId} in guild ${guildId}`, error);
      return false;
    }
  }

  /**
   * Get patrol time in a specific period
   */
  async getUserPatrolTimeInPeriod(
    guildId: string,
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    try {
      // Get start and end dates in UTC
      const startYear = startDate.getUTCFullYear();
      const startMonth = startDate.getUTCMonth() + 1;
      const endYear = endDate.getUTCFullYear();
      const endMonth = endDate.getUTCMonth() + 1;

      let totalMs = 0;

      // Get all monthly records between start and end dates
      const monthlyRecords = await prisma.voicePatrolMonthlyTime.findMany({
        where: {
          guildId,
          userId,
          OR: [
            // Records that fall entirely within the period
            {
              year: { gte: startYear },
              month: { gte: startMonth },
            },
            {
              year: { lte: endYear },
              month: { lte: endMonth },
            },
          ],
        },
      });

      // Sum up all relevant monthly records
      for (const record of monthlyRecords) {
        const recordStart = new Date(Date.UTC(record.year, record.month - 1, 1));
        const recordEnd = new Date(Date.UTC(record.year, record.month, 0, 23, 59, 59, 999));

        // Only count if record overlaps with our period
        if (recordStart <= endDate && recordEnd >= startDate) {
          totalMs += Number(record.totalMs);
        }
      }

      // Add live delta from PatrolTimerManager if we're in the current month
      const now = new Date();
      if (now >= startDate && now <= endDate) {
        const currentYear = now.getUTCFullYear();
        const currentMonth = now.getUTCMonth() + 1;

        // Get user's current patrol time for the current month
        const currentMonthTotal = await this.patrolTimer.getUserTotalForMonth(
          guildId,
          userId,
          currentYear,
          currentMonth,
        );

        // Subtract what we already counted from monthly records
        const existingRecord = monthlyRecords.find(
          (r) => r.year === currentYear && r.month === currentMonth,
        );

        if (existingRecord) {
          // Replace with live total
          totalMs -= Number(existingRecord.totalMs);
        }
        totalMs += currentMonthTotal;
      }

      return totalMs;
    } catch (error) {
      loggers.bot.error(
        `Failed to get patrol time for user ${userId} in guild ${guildId} from ${startDate.toISOString()} to ${endDate.toISOString()}`,
        error,
      );
      return 0;
    }
  }

  /**
   * Check if patrol time threshold is met
   */
  async checkPatrolTimeThreshold(
    guildId: string,
    userId: string,
    _roleId: string,
    roleConfig: RoleTrackingConfig,
    assignmentDate: Date,
  ): Promise<boolean> {
    // If no threshold is set, return false (warn only if patrol time is zero)
    if (!roleConfig.patrolTimeThresholdHours) {
      return false;
    }

    const now = new Date();
    const patrolTimeMs = await this.getUserPatrolTimeInPeriod(
      guildId,
      userId,
      assignmentDate,
      now,
    );

    const patrolTimeHours = patrolTimeMs / (1000 * 60 * 60);
    return patrolTimeHours >= roleConfig.patrolTimeThresholdHours;
  }

  /**
   * Remove warnings for a user-role-assignment combination
   */
  async removeWarningsForUser(
    guildId: string,
    discordId: string,
    roleId: string,
    assignmentTrackingId?: number,
  ): Promise<void> {
    try {
      const userId = await this.getUserIdFromDiscordId(discordId);
      if (!userId) {
        return;
      }

      const where: {
        guildId: string;
        userId: number;
        roleId: string;
        assignmentTrackingId?: number;
      } = {
        guildId,
        userId,
        roleId,
      };

      if (assignmentTrackingId) {
        where.assignmentTrackingId = assignmentTrackingId;
      }

      await prisma.roleTrackingWarning.deleteMany({
        where,
      });
    } catch (error) {
      loggers.bot.error(
        `Failed to remove warnings for user ${discordId}, role ${roleId} in guild ${guildId}`,
        error,
      );
    }
  }

  /**
   * Cleanup warnings for users who have left the server
   */
  async cleanupWarningsForMissingUsers(guildId: string): Promise<number> {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        return 0;
      }

      // Get all unique user IDs from warnings and assignment tracking
      const warnings = await prisma.roleTrackingWarning.findMany({
        where: { guildId },
        select: { userId: true },
        distinct: ["userId"],
      });

      const assignments = await prisma.roleAssignmentTracking.findMany({
        where: { guildId },
        select: { userId: true },
        distinct: ["userId"],
      });

      const allUserIds = new Set<number>();
      for (const w of warnings) {
        allUserIds.add(w.userId);
      }
      for (const a of assignments) {
        allUserIds.add(a.userId);
      }

      let cleanupCount = 0;

      // Check each user to see if they still exist in the guild
      for (const userId of allUserIds) {
        try {
          // Get user to find discordId
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { discordId: true },
          });

          if (!user) {
            // User not found in database, clean up
            await prisma.roleTrackingWarning.deleteMany({
              where: { guildId, userId },
            });
            await prisma.roleAssignmentTracking.deleteMany({
              where: { guildId, userId },
            });
            cleanupCount++;
            continue;
          }

          // Check if user exists in guild
          try {
            await guild.members.fetch(user.discordId);
            // User exists, skip
          } catch {
            // User doesn't exist or has left - clean up their records
            await prisma.roleTrackingWarning.deleteMany({
              where: { guildId, userId },
            });
            await prisma.roleAssignmentTracking.deleteMany({
              where: { guildId, userId },
            });
            cleanupCount++;
          }
        } catch {
          // Error fetching user or member - clean up
          await prisma.roleTrackingWarning.deleteMany({
            where: { guildId, userId },
          });
          await prisma.roleAssignmentTracking.deleteMany({
            where: { guildId, userId },
          });
          cleanupCount++;
        }
      }

      if (cleanupCount > 0) {
        loggers.bot.info(
          `Cleaned up ${cleanupCount} users' role tracking data for guild ${guildId}`,
        );
      }

      return cleanupCount;
    } catch (error) {
      loggers.bot.error(
        `Failed to cleanup warnings for missing users in guild ${guildId}`,
        error,
      );
      return 0;
    }
  }

  /**
   * Check if user has received a specific warning
   */
  async hasReceivedWarning(
    guildId: string,
    discordId: string,
    roleId: string,
    warningIndex: number,
    roleAssignedAt: Date,
  ): Promise<boolean> {
    try {
      const userId = await this.getUserIdFromDiscordId(discordId);
      if (!userId) {
        return false;
      }

      const warning = await prisma.roleTrackingWarning.findFirst({
        where: {
          guildId,
          userId,
          roleId,
          warningIndex,
          roleAssignedAt,
        },
      });

      return !!warning;
    } catch (error) {
      loggers.bot.error(
        `Failed to check warning for user ${discordId}, role ${roleId} in guild ${guildId}`,
        error,
      );
      return false;
    }
  }

  /**
   * Record that a warning was sent
   */
  async recordWarningSent(
    guildId: string,
    discordId: string,
    roleId: string,
    warningType: string,
    warningIndex: number,
    roleAssignedAt: Date,
    assignmentTrackingId?: number,
  ): Promise<void> {
    try {
      const userId = await this.getUserIdFromDiscordId(discordId);
      if (!userId) {
        loggers.bot.error(`Failed to get User ID for Discord ID ${discordId}`);
        return;
      }

      await prisma.roleTrackingWarning.create({
        data: {
          guildId,
          userId,
          roleId,
          warningType,
          warningIndex,
          sentAt: new Date(),
          roleAssignedAt,
          assignmentTrackingId: assignmentTrackingId || null,
        },
      });
    } catch (error) {
      loggers.bot.error(
        `Failed to record warning for user ${discordId}, role ${roleId} in guild ${guildId}`,
        error,
      );
    }
  }

  /**
   * Send warning DM to user
   */
  async sendWarningDM(userId: string, message: string): Promise<{ success: boolean; error?: string }> {
    try {
      const user = await this.client.users.fetch(userId);
      await user.send(message);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Log to staff channel with optional ping
   */
  async logToStaffChannel(
    guildId: string,
    embed: EmbedBuilder,
    shouldPing: boolean,
  ): Promise<void> {
    try {
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId },
        select: { roleTrackingStaffChannelId: true, staffRoleIds: true },
      });

      if (!settings?.roleTrackingStaffChannelId) {
        loggers.bot.debug(
          `No role tracking staff channel configured for guild ${guildId}`,
        );
        return;
      }

      const channel = (await this.client.channels.fetch(
        settings.roleTrackingStaffChannelId,
      )) as TextChannel;

      if (!channel || !channel.isTextBased()) {
        loggers.bot.warn(
          `Invalid role tracking staff channel ${settings.roleTrackingStaffChannelId} for guild ${guildId}`,
        );
        return;
      }

      // Build content with staff ping if needed
      let content = "";
      if (shouldPing && settings.staffRoleIds) {
        const staffRoleIds = Array.isArray(settings.staffRoleIds)
          ? (settings.staffRoleIds as string[])
          : [];
        if (staffRoleIds.length > 0) {
          const roleMentions = staffRoleIds.map((id) => `<@&${id}>`).join(" ");
          content = `${roleMentions}\n`;
        } else {
          content = "@here\n";
        }
      }

      // Use ComponentsV2 format similar to whitelist logger
      const textDisplay = new TextDisplayBuilder()
        .setContent(content + embed.data.description || "");

      const container = new ContainerBuilder()
        .setAccentColor(embed.data.color || Colors.Orange)
        .addTextDisplayComponents([textDisplay]);

      await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { roles: shouldPing && settings.staffRoleIds ? (Array.isArray(settings.staffRoleIds) ? (settings.staffRoleIds as string[]) : []) : [] },
      });

      loggers.bot.info(
        `Logged role tracking message to staff channel for guild ${guildId}`,
      );
    } catch (error) {
      loggers.bot.error(
        `Failed to log to staff channel for guild ${guildId}`,
        error,
      );
    }
  }

  /**
   * Validate role tracking configuration
   */
  validateRoleTrackingConfig(roleConfig: RoleTrackingConfig): ValidationResult {
    const errors: string[] = [];

    // Validate deadline duration
    if (!isValidDuration(roleConfig.deadlineDuration)) {
      errors.push(`Invalid deadlineDuration: "${roleConfig.deadlineDuration}"`);
    }

    const deadlineMs = parseDurationToMs(roleConfig.deadlineDuration);
    if (!deadlineMs) {
      errors.push(`Could not parse deadlineDuration: "${roleConfig.deadlineDuration}"`);
    }

    // Validate staff ping offset
    if (!isValidDuration(roleConfig.staffPingOffset)) {
      errors.push(`Invalid staffPingOffset: "${roleConfig.staffPingOffset}"`);
    }

    const staffPingMs = parseDurationToMs(roleConfig.staffPingOffset);
    if (!staffPingMs) {
      errors.push(`Could not parse staffPingOffset: "${roleConfig.staffPingOffset}"`);
    }

    // Validate threshold
    if (roleConfig.patrolTimeThresholdHours !== null && roleConfig.patrolTimeThresholdHours !== undefined) {
      if (roleConfig.patrolTimeThresholdHours < 0) {
        errors.push("patrolTimeThresholdHours must be a positive number");
      }
    }

    // Validate warnings
    const warningOffsets: number[] = [];
    for (let i = 0; i < roleConfig.warnings.length; i++) {
      const warning = roleConfig.warnings[i];

      // Validate offset
      if (!isValidDuration(warning.offset)) {
        errors.push(`Invalid warning offset at index ${i}: "${warning.offset}"`);
      } else {
        const offsetMs = parseDurationToMs(warning.offset);
        if (offsetMs) {
          warningOffsets.push(offsetMs);

          // Check if offset exceeds deadline
          if (deadlineMs && offsetMs > deadlineMs) {
            errors.push(
              `Warning offset "${warning.offset}" at index ${i} exceeds deadlineDuration "${roleConfig.deadlineDuration}"`,
            );
          }
        }
      }

      // Validate index matches array position
      if (warning.index !== i) {
        errors.push(
          `Warning index ${warning.index} at array position ${i} does not match`,
        );
      }
    }

    // Check if warning offsets are in ascending order
    for (let i = 1; i < warningOffsets.length; i++) {
      if (warningOffsets[i] < warningOffsets[i - 1]) {
        errors.push(
          `Warning offsets must be in ascending order. Offset at index ${i} is before offset at index ${i - 1}`,
        );
      }
    }

    // Check if staff ping offset exceeds deadline
    if (deadlineMs && staffPingMs && staffPingMs > deadlineMs) {
      errors.push(
        `staffPingOffset "${roleConfig.staffPingOffset}" exceeds deadlineDuration "${roleConfig.deadlineDuration}"`,
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Parse message template with placeholders
   */
  parseMessageTemplate(
    template: string,
    variables: Record<string, string | number>,
  ): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), String(value));
    }

    return result;
  }

  /**
   * Check and send warnings for all configured roles in a guild
   */
  async checkAndSendWarnings(guildId: string): Promise<void> {
    try {
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId },
      });

      if (!settings || !settings.roleTrackingConfig) {
        return;
      }

      const config = (settings?.roleTrackingConfig as unknown as RoleTrackingConfigMap) || {};
      const systemInitDate = settings?.roleTrackingInitializedAt || new Date();

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        return;
      }

      // First, cleanup warnings for users who have left
      await this.cleanupWarningsForMissingUsers(guildId);

      // Process each configured role
      for (const [roleId, roleConfig] of Object.entries(config)) {
        if (!roleConfig.enabled) {
          continue;
        }

        // Get all members with this role
        const role = guild.roles.cache.get(roleId);
        if (!role) {
          continue;
        }

        const members = role.members;

        for (const member of members.values()) {
          try {
            // Check if user has LOA role - if true, skip entirely
            if (await this.hasLOARole(guildId, member.id)) {
              continue;
            }

            // Get role assignment date (member.id is discordId)
            const assignmentDate = await this.getRoleAssignmentDate(
              guildId,
              member.id, // discordId
              roleId,
              systemInitDate,
            );

            // Check patrol time threshold - if met, remove warnings and skip
            const thresholdMet = await this.checkPatrolTimeThreshold(
              guildId,
              member.id,
              roleId,
              roleConfig,
              assignmentDate,
            );

            if (thresholdMet) {
              await this.removeWarningsForUser(guildId, member.id, roleId);
              continue;
            }

            // Get patrol time in period
            const now = new Date();
            const patrolTimeMs = await this.getUserPatrolTimeInPeriod(
              guildId,
              member.id,
              assignmentDate,
              now,
            );

            const patrolTimeHours = patrolTimeMs / (1000 * 60 * 60);

            // Calculate time since role assignment
            const timeSinceAssignment = now.getTime() - assignmentDate.getTime();
            const deadlineMs = parseDurationToMs(roleConfig.deadlineDuration);
            if (!deadlineMs) {
              loggers.bot.warn(
                `Invalid deadline duration for role ${roleId} in guild ${guildId}`,
              );
              continue;
            }

            // Get assignment tracking record
            const userId = await this.getUserIdFromDiscordId(member.id);
            if (!userId) {
              loggers.bot.warn(`Failed to get User ID for member ${member.id} in guild ${guildId}`);
              continue;
            }

            const assignmentTracking = await prisma.roleAssignmentTracking.findUnique({
              where: {
                guildId_userId_roleId: {
                  guildId,
                  userId,
                  roleId,
                },
              },
            });

            // Check each warning to see if it should be sent
            for (const warning of roleConfig.warnings) {
              const warningOffsetMs = parseDurationToMs(warning.offset);
              if (!warningOffsetMs) {
                continue;
              }

              // Check if we're past this warning's offset
              if (timeSinceAssignment >= warningOffsetMs) {
                // Check if this warning has already been sent (member.id is discordId)
                const hasReceived = await this.hasReceivedWarning(
                  guildId,
                  member.id, // discordId
                  roleId,
                  warning.index,
                  assignmentDate,
                );

                if (!hasReceived) {
                  // Send warning
                  const timeRemainingMs = deadlineMs - timeSinceAssignment;
                  const timeRemaining = msToDurationString(timeRemainingMs);

                  const deadlineDate = new Date(
                    assignmentDate.getTime() + deadlineMs,
                  );

                  const message = this.parseMessageTemplate(warning.message, {
                    roleName: roleConfig.roleName,
                    timeRemaining,
                    deadlineDate: deadlineDate.toLocaleDateString(),
                    patrolTime: Math.floor(patrolTimeMs),
                    patrolTimeHours: patrolTimeHours.toFixed(1),
                    patrolTimeFormatted: msToDurationString(patrolTimeMs),
                  });

                  const dmResult = await this.sendWarningDM(member.id, message);

                  // Record warning sent
                  await this.recordWarningSent(
                    guildId,
                    member.id,
                    roleId,
                    "warning",
                    warning.index,
                    assignmentDate,
                    assignmentTracking?.id,
                  );

                  // Log to staff channel without ping
                  const logEmbed = new EmbedBuilder()
                    .setTitle(`⚠️ Role Tracking Warning Sent`)
                    .setDescription(
                      `Warning #${warning.index + 1} sent to <@${member.id}> for role **${roleConfig.roleName}**`,
                    )
                    .addFields(
                      { name: "User", value: `<@${member.id}>`, inline: true },
                      { name: "Role", value: roleConfig.roleName, inline: true },
                      {
                        name: "Warning",
                        value: `#${warning.index + 1} (${warning.offset})`,
                        inline: true,
                      },
                      {
                        name: "Patrol Time",
                        value: `${patrolTimeHours.toFixed(1)} hours`,
                        inline: true,
                      },
                      {
                        name: "Time Remaining",
                        value: timeRemaining,
                        inline: true,
                      },
                      {
                        name: "DM Status",
                        value: dmResult.success ? "✅ Sent" : `❌ Failed: ${dmResult.error}`,
                        inline: true,
                      },
                    )
                    .setColor(Colors.Orange)
                    .setTimestamp();

                  await this.logToStaffChannel(guildId, logEmbed, false);
                }
              }
            }

            // Check if staff ping should be sent
            const staffPingOffsetMs = parseDurationToMs(roleConfig.staffPingOffset);
            if (staffPingOffsetMs && timeSinceAssignment >= staffPingOffsetMs) {
              const hasReceivedPing = await this.hasReceivedWarning(
                guildId,
                member.id,
                roleId,
                -1, // Use -1 for staff ping
                assignmentDate,
              );

              if (!hasReceivedPing) {
                const message = this.parseMessageTemplate(roleConfig.staffPingMessage, {
                  userMention: `<@${member.id}>`,
                  roleName: roleConfig.roleName,
                  patrolTimeHours: patrolTimeHours.toFixed(1),
                });

                const dmResult = await this.sendWarningDM(member.id, message);

                // Record staff ping
                await this.recordWarningSent(
                  guildId,
                  member.id,
                  roleId,
                  "staff_ping",
                  -1,
                  assignmentDate,
                  assignmentTracking?.id,
                );

                // Log to staff channel WITH ping
                const logEmbed = new EmbedBuilder()
                  .setTitle(`🚨 Role Tracking Deadline Reached`)
                  .setDescription(
                    `Staff ping: <@${member.id}> has reached the deadline for role **${roleConfig.roleName}**`,
                  )
                  .addFields(
                    { name: "User", value: `<@${member.id}>`, inline: true },
                    { name: "Role", value: roleConfig.roleName, inline: true },
                    {
                      name: "Patrol Time",
                      value: `${patrolTimeHours.toFixed(1)} hours`,
                      inline: true,
                    },
                    {
                      name: "DM Status",
                      value: dmResult.success ? "✅ Sent" : `❌ Failed: ${dmResult.error}`,
                      inline: true,
                    },
                  )
                  .setColor(Colors.Red)
                  .setTimestamp();

                await this.logToStaffChannel(guildId, logEmbed, true);
              }
            }
          } catch (error) {
            loggers.bot.error(
              `Error processing user ${member.id} for role ${roleId} in guild ${guildId}`,
              error,
            );
          }
        }
      }
    } catch (error) {
      loggers.bot.error(`Error checking and sending warnings for guild ${guildId}`, error);
    }
  }
}
