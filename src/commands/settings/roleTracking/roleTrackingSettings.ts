import {
  Discord,
  Guard,
  Slash,
  SlashGroup,
  SlashOption,
} from "discordx";
import {
  CommandInteraction,
  ApplicationCommandOptionType,
  MessageFlags,
  EmbedBuilder,
  Colors,
  GuildBasedChannel,
  Role,
  User,
  ChannelType,
} from "discord.js";
import { Pagination } from "@discordx/pagination";
import { prisma } from "../../../main.js";
import { StaffGuard } from "../../../utility/guards.js";
import { loggers } from "../../../utility/logger.js";
import { roleTrackingManager } from "../../../main.js";
import type { RoleTrackingConfig, RoleTrackingConfigMap } from "../../../managers/roleTracking/roleTrackingManager.js";
import { parseDurationToMs, isValidDuration } from "../../../utility/roleTracking/durationParser.js";

@Discord()
@SlashGroup({
  description: "Role tracking settings",
  name: "role-tracking",
  root: "settings",
})
@SlashGroup("role-tracking", "settings")
@Guard(StaffGuard)
export class SettingsRoleTrackingCommands {
  /**
   * Get default configuration for a role based on deadline
   */
  private getDefaultConfig(roleName: string, deadline: string, _roleId: string): RoleTrackingConfig {
    const deadlineMs = parseDurationToMs(deadline);
    if (!deadlineMs) {
      throw new Error(`Invalid deadline: ${deadline}`);
    }

    // Default configuration - Cadet pattern (weekly warnings)
    if (deadlineMs <= 35 * 24 * 60 * 60 * 1000) {
      // 35 days or less - use weekly warnings
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const weeks = Math.floor(deadlineMs / weekMs);
      
      const warnings = [];
      for (let i = 1; i < weeks; i++) {
        warnings.push({
          index: i - 1,
          offset: `${i} week${i > 1 ? "s" : ""}`,
          type: "warning",
          message: `Hello! This is your Week ${i} reminder for the {roleName} role. You have ${weeks - i} week${weeks - i > 1 ? "s" : ""} remaining. Make sure you're getting your patrol time in! If you need extended time, please request a Leave of Absence (LOA).`,
        });
      }

      return {
        enabled: true,
        roleName,
        deadlineDuration: deadline,
        patrolTimeThresholdHours: null,
        warnings,
        staffPingOffset: `${weeks} weeks`,
        staffPingMessage: `User {userMention} has reached the deadline for {roleName} role completion. Patrol time: {patrolTimeHours} hours.`,
      };
    } else {
      // More than 35 days - use monthly warnings
      const monthMs = 30 * 24 * 60 * 60 * 1000;
      const months = Math.floor(deadlineMs / monthMs);
      
      const warnings = [];
      for (let i = 2; i <= months; i++) {
        warnings.push({
          index: i - 2,
          offset: `${i} months`,
          type: "warning",
          message: `Hello! This is your ${i === months ? `${i}rd` : `${i}nd`} month reminder for the {roleName} role. You have ${months - i + 1} month${months - i + 1 > 1 ? "s" : ""} remaining. Keep up with your patrol time! If you need extended time off from S.H.I.E.L.D., please request a Leave of Absence (LOA).`,
        });
      }

      return {
        enabled: true,
        roleName,
        deadlineDuration: deadline,
        patrolTimeThresholdHours: null,
        warnings,
        staffPingOffset: `${months} months`,
        staffPingMessage: `User {userMention} has reached the ${months}-month deadline for {roleName} role patrol time requirements. Patrol time: {patrolTimeHours} hours.`,
      };
    }
  }

  @Slash({
    name: "add-role",
    description: "Add a role to role tracking",
  })
  async addRole(
    @SlashOption({
      name: "role",
      description: "The role to track",
      type: ApplicationCommandOptionType.Role,
      required: true,
    })
    role: Role,
    @SlashOption({
      name: "deadline",
      description: "Deadline duration (e.g., '1 month', '3 months', '90 days')",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    deadline: string,
    @SlashOption({
      name: "patrol_threshold_hours",
      description: "Minimum patrol time in hours to avoid warnings (optional)",
      type: ApplicationCommandOptionType.Number,
      required: false,
    })
    patrolThresholdHours: number | null,
    @SlashOption({
      name: "staff_channel",
      description: "Channel for staff notifications (optional, can be set separately)",
      type: ApplicationCommandOptionType.Channel,
      required: false,
    })
    staffChannel: GuildBasedChannel | null,
    interaction: CommandInteraction,
  ): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      // Validate deadline
      if (!isValidDuration(deadline)) {
        await interaction.reply({
          content: `❌ Invalid deadline format: "${deadline}". Use formats like "1 week", "2 months", "90 days", etc.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Validate threshold if provided
      if (patrolThresholdHours !== null && patrolThresholdHours < 0) {
        await interaction.reply({
          content: "❌ Patrol threshold hours must be a positive number.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Get current settings
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
      });

      const currentConfig = (settings?.roleTrackingConfig as unknown as RoleTrackingConfigMap) || {};

      // Check if role already exists
      if (currentConfig[role.id]) {
        await interaction.reply({
          content: `❌ Role <@&${role.id}> is already configured for tracking. Use \`/settings role-tracking remove-role\` first to reconfigure it.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Create default configuration
      const roleConfig = this.getDefaultConfig(role.name, deadline, role.id);
      if (patrolThresholdHours !== null) {
        roleConfig.patrolTimeThresholdHours = patrolThresholdHours;
      }

      // Validate configuration
      const validation = roleTrackingManager.validateRoleTrackingConfig(roleConfig);
      if (!validation.valid) {
        await interaction.reply({
          content: `❌ Configuration validation failed:\n${validation.errors.map((e) => `• ${e}`).join("\n")}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Update settings
      const newConfig = {
        ...currentConfig,
        [role.id]: roleConfig,
      };

      const updateData: any = {
        roleTrackingConfig: newConfig as any,
      };

      // Set initialization date if not set
      if (!settings?.roleTrackingInitializedAt) {
        updateData.roleTrackingInitializedAt = new Date();
      }

      // Set staff channel if provided
      if (staffChannel) {
        if (
          staffChannel.type !== ChannelType.GuildText &&
          staffChannel.type !== ChannelType.GuildAnnouncement
        ) {
          await interaction.reply({
            content: "❌ The staff channel must be a text or announcement channel.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        updateData.roleTrackingStaffChannelId = staffChannel.id;
      }

      await prisma.guildSettings.upsert({
        where: { guildId: interaction.guildId },
        update: updateData,
        create: {
          guildId: interaction.guildId,
          ...updateData,
        },
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Role Added to Tracking")
        .setDescription(`Role <@&${role.id}> has been added to role tracking.`)
        .addFields(
          { name: "Role", value: `<@&${role.id}>`, inline: true },
          { name: "Deadline", value: deadline, inline: true },
          {
            name: "Patrol Threshold",
            value: patrolThresholdHours !== null ? `${patrolThresholdHours} hours` : "Not set",
            inline: true,
          },
          {
            name: "Warnings",
            value: `${roleConfig.warnings.length} warning(s) configured`,
            inline: true,
          },
        )
        .setColor(Colors.Green)
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
      loggers.bot.error("Error adding role to tracking", error);
      await interaction.reply({
        content: `❌ Failed to add role to tracking: ${error instanceof Error ? error.message : "Unknown error"}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  @Slash({
    name: "set-staff-channel",
    description: "Set the staff notification channel for role tracking",
  })
  async setStaffChannel(
    @SlashOption({
      name: "channel",
      description: "Channel for staff notifications",
      type: ApplicationCommandOptionType.Channel,
      required: true,
    })
    channel: GuildBasedChannel,
    interaction: CommandInteraction,
  ): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      if (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement
      ) {
        await interaction.reply({
          content: "❌ The channel must be a text or announcement channel.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await prisma.guildSettings.upsert({
        where: { guildId: interaction.guildId },
        update: { roleTrackingStaffChannelId: channel.id },
        create: {
          guildId: interaction.guildId,
          roleTrackingStaffChannelId: channel.id,
        },
      });

      await interaction.reply({
        content: `✅ Role tracking staff channel set to <#${channel.id}>`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      loggers.bot.error("Error setting staff channel", error);
      await interaction.reply({
        content: `❌ Failed to set staff channel: ${error instanceof Error ? error.message : "Unknown error"}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  @Slash({
    name: "view-config",
    description: "View role tracking configuration",
  })
  async viewConfig(interaction: CommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
      });

      const config = (settings?.roleTrackingConfig as unknown as RoleTrackingConfigMap) || {};

      if (Object.keys(config).length === 0) {
        await interaction.editReply({
          content: "ℹ️ No roles are configured for tracking yet. Use `/settings role-tracking add-role` to add one.",
        });
        return;
      }

      const roles = Object.entries(config);
      const pageSize = 5;
      const pages: Array<{ embeds: EmbedBuilder[] }> = [];

      for (let i = 0; i < roles.length; i += pageSize) {
        const pageRoles = roles.slice(i, i + pageSize);
        let description = "";

        for (const [roleId, roleConfig] of pageRoles) {
          const status = roleConfig.enabled ? "✅" : "❌";
          const threshold = roleConfig.patrolTimeThresholdHours
            ? `${roleConfig.patrolTimeThresholdHours} hours`
            : "Not set";
          
          description += `${status} **<@&${roleId}>** (${roleConfig.roleName})\n`;
          description += `  • Deadline: ${roleConfig.deadlineDuration}\n`;
          description += `  • Threshold: ${threshold}\n`;
          description += `  • Warnings: ${roleConfig.warnings.length}\n`;
          description += `  • Staff Ping: ${roleConfig.staffPingOffset}\n\n`;
        }

        const embed = new EmbedBuilder()
          .setTitle("Role Tracking Configuration")
          .setDescription(description || "No roles configured")
          .setColor(Colors.Blue)
          .setFooter({
            text: `Page ${Math.floor(i / pageSize) + 1} of ${Math.ceil(roles.length / pageSize)} • Total: ${roles.length} role(s)`,
          })
          .setTimestamp();

        if (settings?.roleTrackingStaffChannelId && i === 0) {
          embed.addFields({
            name: "Staff Channel",
            value: `<#${settings.roleTrackingStaffChannelId}>`,
            inline: true,
          });
        }

        pages.push({ embeds: [embed] });
      }

      if (pages.length === 1) {
        await interaction.editReply(pages[0]);
        return;
      }

      const pagination = new Pagination(interaction, pages, {
        ephemeral: true,
        time: 120_000,
      });

      await pagination.send();
    } catch (error) {
      loggers.bot.error("Error viewing role tracking config", error);
      if (interaction.deferred) {
        await interaction.editReply({
          content: `❌ Failed to view configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      } else {
        await interaction.reply({
          content: `❌ Failed to view configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }

  @Slash({
    name: "manage",
    description: "Interactive role tracking management interface",
  })
  async manage(interaction: CommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
      });

      const config = (settings?.roleTrackingConfig as unknown as RoleTrackingConfigMap) || {};

      if (Object.keys(config).length === 0) {
        await interaction.editReply({
          content: "ℹ️ No roles are configured for tracking yet. Use `/settings role-tracking add-role` to add one.",
        });
        return;
      }

      const roles = Object.entries(config);
      const pageSize = 5;
      const pages: Array<{ embeds: EmbedBuilder[] }> = [];

      for (let i = 0; i < roles.length; i += pageSize) {
        const pageRoles = roles.slice(i, i + pageSize);
        let description = "";

        for (const [roleId, roleConfig] of pageRoles) {
          const status = roleConfig.enabled ? "✅ Enabled" : "❌ Disabled";
          const threshold = roleConfig.patrolTimeThresholdHours
            ? `${roleConfig.patrolTimeThresholdHours} hours`
            : "Not set";
          
          description += `**<@&${roleId}>** - ${roleConfig.roleName}\n`;
          description += `Status: ${status}\n`;
          description += `Deadline: ${roleConfig.deadlineDuration}\n`;
          description += `Threshold: ${threshold}\n`;
          description += `Warnings: ${roleConfig.warnings.length}\n`;
          description += `Staff Ping: ${roleConfig.staffPingOffset}\n`;
          description += `\nUse \`/settings role-tracking toggle-role\` to enable/disable.\n`;
          description += `Use \`/settings role-tracking configure-warning\` to edit warnings.\n\n`;
        }

        const embed = new EmbedBuilder()
          .setTitle("Role Tracking Management")
          .setDescription(description || "No roles configured")
          .setColor(Colors.Blue)
          .setFooter({
            text: `Page ${Math.floor(i / pageSize) + 1} of ${Math.ceil(roles.length / pageSize)} • Use commands to manage roles`,
          })
          .setTimestamp();

        pages.push({ embeds: [embed] });
      }

      if (pages.length === 1) {
        await interaction.editReply(pages[0]);
        return;
      }

      const pagination = new Pagination(interaction, pages, {
        ephemeral: true,
        time: 120_000,
      });

      await pagination.send();
    } catch (error) {
      loggers.bot.error("Error in manage command", error);
      if (interaction.deferred) {
        await interaction.editReply({
          content: `❌ Failed to open management interface: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      } else {
        await interaction.reply({
          content: `❌ Failed to open management interface: ${error instanceof Error ? error.message : "Unknown error"}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }

  @Slash({
    name: "remove-role",
    description: "Remove a role from role tracking",
  })
  async removeRole(
    @SlashOption({
      name: "role",
      description: "The role to remove from tracking",
      type: ApplicationCommandOptionType.Role,
      required: true,
    })
    role: Role,
    interaction: CommandInteraction,
  ): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
      });

      const currentConfig = (settings?.roleTrackingConfig as unknown as RoleTrackingConfigMap) || {};

      if (!currentConfig[role.id]) {
        await interaction.reply({
          content: `❌ Role <@&${role.id}> is not configured for tracking.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const newConfig = { ...currentConfig };
      delete newConfig[role.id];

      await prisma.guildSettings.update({
        where: { guildId: interaction.guildId },
        data: { roleTrackingConfig: newConfig as any },
      });

      await interaction.reply({
        content: `✅ Role <@&${role.id}> removed from tracking.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      loggers.bot.error("Error removing role from tracking", error);
      await interaction.reply({
        content: `❌ Failed to remove role: ${error instanceof Error ? error.message : "Unknown error"}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  @Slash({
    name: "toggle-role",
    description: "Enable or disable tracking for a role",
  })
  async toggleRole(
    @SlashOption({
      name: "role",
      description: "The role to toggle",
      type: ApplicationCommandOptionType.Role,
      required: true,
    })
    role: Role,
    @SlashOption({
      name: "enabled",
      description: "Enable or disable tracking",
      type: ApplicationCommandOptionType.Boolean,
      required: true,
    })
    enabled: boolean,
    interaction: CommandInteraction,
  ): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
      });

      const currentConfig = (settings?.roleTrackingConfig as unknown as RoleTrackingConfigMap) || {};

      if (!currentConfig[role.id]) {
        await interaction.reply({
          content: `❌ Role <@&${role.id}> is not configured for tracking. Use \`/settings role-tracking add-role\` first.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const newConfig = {
        ...currentConfig,
        [role.id]: {
          ...currentConfig[role.id],
          enabled,
        },
      };

      await prisma.guildSettings.update({
        where: { guildId: interaction.guildId },
        data: { roleTrackingConfig: newConfig as any },
      });

      await interaction.reply({
        content: `✅ Role <@&${role.id}> tracking ${enabled ? "enabled" : "disabled"}.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      loggers.bot.error("Error toggling role tracking", error);
      await interaction.reply({
        content: `❌ Failed to toggle role: ${error instanceof Error ? error.message : "Unknown error"}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  @Slash({
    name: "set-threshold",
    description: "Set or remove patrol time threshold for a role",
  })
  async setThreshold(
    @SlashOption({
      name: "role",
      description: "The role to set threshold for",
      type: ApplicationCommandOptionType.Role,
      required: true,
    })
    role: Role,
    @SlashOption({
      name: "threshold_hours",
      description: "Minimum patrol time in hours (leave empty to remove threshold)",
      type: ApplicationCommandOptionType.Number,
      required: false,
    })
    thresholdHours: number | null,
    interaction: CommandInteraction,
  ): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
      });

      const currentConfig = (settings?.roleTrackingConfig as unknown as RoleTrackingConfigMap) || {};

      if (!currentConfig[role.id]) {
        await interaction.reply({
          content: `❌ Role <@&${role.id}> is not configured for tracking. Use \`/settings role-tracking add-role\` first.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (thresholdHours !== null && thresholdHours < 0) {
        await interaction.reply({
          content: "❌ Threshold hours must be a positive number.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const newConfig = {
        ...currentConfig,
        [role.id]: {
          ...currentConfig[role.id],
          patrolTimeThresholdHours: thresholdHours,
        },
      };

      await prisma.guildSettings.update({
        where: { guildId: interaction.guildId },
        data: { roleTrackingConfig: newConfig as any },
      });

      await interaction.reply({
        content: `✅ Patrol time threshold for <@&${role.id}> ${thresholdHours !== null ? `set to ${thresholdHours} hours` : "removed"}.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      loggers.bot.error("Error setting threshold", error);
      await interaction.reply({
        content: `❌ Failed to set threshold: ${error instanceof Error ? error.message : "Unknown error"}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  @Slash({
    name: "reset-timer",
    description: "Manually reset role assignment timer for a user",
  })
  async resetTimer(
    @SlashOption({
      name: "user",
      description: "The user to reset timer for",
      type: ApplicationCommandOptionType.User,
      required: true,
    })
    user: User,
    @SlashOption({
      name: "role",
      description: "The role to reset (leave empty to reset all roles for user)",
      type: ApplicationCommandOptionType.Role,
      required: false,
    })
    role: Role | null,
    interaction: CommandInteraction,
  ): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const now = new Date();

      // Get or create user in database
      let dbUser = await prisma.user.findUnique({
        where: { discordId: user.id },
      });

      if (!dbUser) {
        dbUser = await prisma.user.create({
          data: { discordId: user.id },
        });
      }

      const userId = dbUser.id;

      if (role) {
        // Reset specific role
        await prisma.roleAssignmentTracking.updateMany({
          where: {
            guildId: interaction.guildId,
            userId,
            roleId: role.id,
          },
          data: {
            assignedAt: now,
            updatedAt: now,
          },
        });

        // Remove warnings for this user-role pair
        await roleTrackingManager.removeWarningsForUser(
          interaction.guildId,
          user.id, // discordId for manager method
          role.id,
        );

        await interaction.reply({
          content: `✅ Timer reset for <@${user.id}> for role <@&${role.id}>. All warnings have been removed.`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        // Reset all roles for user
        await prisma.roleAssignmentTracking.updateMany({
          where: {
            guildId: interaction.guildId,
            userId,
          },
          data: {
            assignedAt: now,
            updatedAt: now,
          },
        });

        // Remove all warnings for this user
        await prisma.roleTrackingWarning.deleteMany({
          where: {
            guildId: interaction.guildId,
            userId,
          },
        });

        await interaction.reply({
          content: `✅ All timers reset for <@${user.id}>. All warnings have been removed.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // Log to staff channel
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
        select: { roleTrackingStaffChannelId: true },
      });

      if (settings?.roleTrackingStaffChannelId) {
        const logEmbed = new EmbedBuilder()
          .setTitle("🔄 Role Tracking Timer Reset")
          .setDescription(
            `Timer reset for <@${user.id}>${role ? ` for role <@&${role.id}>` : " (all roles)"} by <@${interaction.user.id}>`,
          )
          .setColor(Colors.Orange)
          .setTimestamp();

        await roleTrackingManager.logToStaffChannel(
          interaction.guildId,
          logEmbed,
          false,
        );
      }
    } catch (error) {
      loggers.bot.error("Error resetting timer", error);
      await interaction.reply({
        content: `❌ Failed to reset timer: ${error instanceof Error ? error.message : "Unknown error"}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  @Slash({
    name: "cleanup",
    description: "Cleanup warnings for users who have left",
  })
  async cleanup(
    @SlashOption({
      name: "all_users",
      description: "If true, cleanup all left users (default: false)",
      type: ApplicationCommandOptionType.Boolean,
      required: false,
    })
    _allUsers: boolean | null,
    interaction: CommandInteraction,
  ): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const cleanupCount = await roleTrackingManager.cleanupWarningsForMissingUsers(
        interaction.guildId,
      );

      await interaction.editReply({
        content: `✅ Cleanup completed. Removed tracking data for ${cleanupCount} user(s) who have left the server.`,
      });
    } catch (error) {
      loggers.bot.error("Error cleaning up warnings", error);
      await interaction.editReply({
        content: `❌ Failed to cleanup: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  @Slash({
    name: "configure-warning",
    description: "Configure a warning message and timing",
  })
  async configureWarning(
    @SlashOption({
      name: "role",
      description: "The role to configure warning for",
      type: ApplicationCommandOptionType.Role,
      required: true,
    })
    role: Role,
    @SlashOption({
      name: "warning_number",
      description: "Warning number (0-based index)",
      type: ApplicationCommandOptionType.Integer,
      required: true,
    })
    warningNumber: number,
    @SlashOption({
      name: "offset",
      description: "Warning offset (e.g., '1 week', '2 months')",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    offset: string,
    @SlashOption({
      name: "message",
      description: "Warning message (can use placeholders: {roleName}, {timeRemaining}, {patrolTimeHours})",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    message: string,
    interaction: CommandInteraction,
  ): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      if (warningNumber < 0) {
        await interaction.reply({
          content: "❌ Warning number must be 0 or greater.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (!isValidDuration(offset)) {
        await interaction.reply({
          content: `❌ Invalid offset format: "${offset}". Use formats like "1 week", "2 months", etc.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
      });

      const currentConfig = (settings?.roleTrackingConfig as unknown as RoleTrackingConfigMap) || {};

      if (!currentConfig[role.id]) {
        await interaction.reply({
          content: `❌ Role <@&${role.id}> is not configured for tracking. Use \`/settings role-tracking add-role\` first.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const roleConfig = currentConfig[role.id];
      const deadlineMs = parseDurationToMs(roleConfig.deadlineDuration);
      const offsetMs = parseDurationToMs(offset);

      if (!deadlineMs || !offsetMs) {
        await interaction.reply({
          content: "❌ Failed to parse durations.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (offsetMs > deadlineMs) {
        await interaction.reply({
          content: `❌ Warning offset "${offset}" exceeds deadline "${roleConfig.deadlineDuration}".`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Update or add warning
      const warnings = [...roleConfig.warnings];
      const existingIndex = warnings.findIndex((w) => w.index === warningNumber);

      if (existingIndex >= 0) {
        warnings[existingIndex] = {
          index: warningNumber,
          offset,
          type: "warning",
          message,
        };
      } else {
        warnings.push({
          index: warningNumber,
          offset,
          type: "warning",
          message,
        });
        warnings.sort((a, b) => a.index - b.index);
      }

      const newConfig = {
        ...currentConfig,
        [role.id]: {
          ...roleConfig,
          warnings,
        },
      };

      // Validate configuration
      const validation = roleTrackingManager.validateRoleTrackingConfig(newConfig[role.id]);
      if (!validation.valid) {
        await interaction.reply({
          content: `❌ Configuration validation failed:\n${validation.errors.map((e) => `• ${e}`).join("\n")}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await prisma.guildSettings.update({
        where: { guildId: interaction.guildId },
        data: { roleTrackingConfig: newConfig as any },
      });

      await interaction.reply({
        content: `✅ Warning #${warningNumber} configured for <@&${role.id}> at offset ${offset}.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      loggers.bot.error("Error configuring warning", error);
      await interaction.reply({
        content: `❌ Failed to configure warning: ${error instanceof Error ? error.message : "Unknown error"}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
