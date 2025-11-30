import { Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";
import {
  CommandInteraction,
  MessageFlags,
  ApplicationCommandOptionType,
  Channel,
  Role,
  ChannelType,
  User,
} from "discord.js";
import { prisma, patrolTimer } from "../../../main.js";
import { StaffGuard } from "../../../utility/guards.js";
import { loggers } from "../../../utility/logger.js";

@Discord()
@SlashGroup({
  description: "Promotion settings",
  name: "promotion",
  root: "patrol",
})
@SlashGroup("promotion", "patrol")
@SlashGroup("patrol", "settings")
@Guard(StaffGuard)
export class SettingsPatrolPromotionCommands {
  @Slash({
    name: "set-channel",
    description: "Set the channel for promotion notifications",
  })
  async setChannel(
    @SlashOption({
      name: "channel",
      description: "The channel to send promotion notifications to",
      type: ApplicationCommandOptionType.Channel,
      required: true,
    })
    channel: Channel,
    interaction: CommandInteraction,
  ) {
    if (!interaction.guildId) return;

    // Verify it's a text channel
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

    // Update settings
    await prisma.guildSettings.upsert({
      where: { guildId: interaction.guildId },
      update: { promotionChannelId: channel.id },
      create: { guildId: interaction.guildId, promotionChannelId: channel.id },
    });

    await interaction.reply({
      content: `✅ Promotion channel set to <#${channel.id}>`,
      flags: MessageFlags.Ephemeral,
    });
  }

  @Slash({
    name: "set-role",
    description: "Set the recruit role required for promotion eligibility",
  })
  async setRole(
    @SlashOption({
      name: "role",
      description: "The recruit role",
      type: ApplicationCommandOptionType.Role,
      required: true,
    })
    role: Role,
    interaction: CommandInteraction,
  ) {
    if (!interaction.guildId) return;

    // Update settings
    await prisma.guildSettings.upsert({
      where: { guildId: interaction.guildId },
      update: { promotionRecruitRoleId: role.id },
      create: { guildId: interaction.guildId, promotionRecruitRoleId: role.id },
    });

    await interaction.reply({
      content: `✅ Promotion recruit role set to <@&${role.id}>`,
      flags: MessageFlags.Ephemeral,
    });
  }

  @Slash({
    name: "set-min-hours",
    description: "Set the minimum hours required for promotion",
  })
  async setMinHours(
    @SlashOption({
      name: "hours",
      description: "Minimum total hours (can be decimal, e.g., 4.5)",
      type: ApplicationCommandOptionType.Number,
      required: true,
      minValue: 0.1,
      maxValue: 1000,
    })
    hours: number,
    interaction: CommandInteraction,
  ) {
    if (!interaction.guildId) return;

    // Update settings
    await prisma.guildSettings.upsert({
      where: { guildId: interaction.guildId },
      update: { promotionMinHours: hours },
      create: { guildId: interaction.guildId, promotionMinHours: hours },
    });

    await interaction.reply({
      content: `✅ Minimum hours for promotion set to ${hours}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  @Slash({
    name: "view",
    description: "View current promotion settings",
  })
  async view(interaction: CommandInteraction) {
    if (!interaction.guildId) return;

    const settings = await prisma.guildSettings.findUnique({
      where: { guildId: interaction.guildId },
    });

    if (!settings) {
      await interaction.reply({
        content: "❌ No settings configured yet.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = settings.promotionChannelId
      ? `<#${settings.promotionChannelId}>`
      : "Not set";
    const role = settings.promotionRecruitRoleId
      ? `<@&${settings.promotionRecruitRoleId}>`
      : "Not set";
    const minHours = settings.promotionMinHours ?? 4;

    const message = `**Promotion Settings**
    
**Channel:** ${channel}
**Recruit Role:** ${role}
**Minimum Hours:** ${minHours}

${!settings.promotionChannelId || !settings.promotionRecruitRoleId ? "\n⚠️ Promotion system is not fully configured. Set both channel and role to enable." : ""}`;

    await interaction.reply({
      content: message,
      flags: MessageFlags.Ephemeral,
    });
  }

  @Slash({
    name: "disable",
    description: "Disable the promotion notification system",
  })
  async disable(interaction: CommandInteraction) {
    if (!interaction.guildId) return;

    await prisma.guildSettings.update({
      where: { guildId: interaction.guildId },
      data: {
        promotionChannelId: null,
        promotionRecruitRoleId: null,
      },
    });

    await interaction.reply({
      content: "✅ Promotion notification system disabled.",
      flags: MessageFlags.Ephemeral,
    });
  }

  @Slash({
    name: "reset-user",
    description: "Reset promotion tracking for a user (allows them to be promoted again)",
  })
  async resetUser(
    @SlashOption({
      name: "user",
      description: "User to reset promotion tracking for",
      type: ApplicationCommandOptionType.User,
      required: true,
    })
    user: any,
    interaction: CommandInteraction,
  ) {
    if (!interaction.guildId) return;

    const deleted = await (prisma as any).voicePatrolPromotion.deleteMany({
      where: {
        guildId: interaction.guildId,
        userId: user.id,
      },
    });

    if (deleted.count > 0) {
      await interaction.reply({
        content: `✅ Reset promotion tracking for <@${user.id}>. They can now be promoted again if they meet the criteria.`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: `ℹ️ <@${user.id}> has no promotion record to reset.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  @Slash({
    name: "check",
    description: "Manually check a user for promotion eligibility",
  })
  async check(
    @SlashOption({
      name: "user",
      description: "User to check for promotion",
      type: ApplicationCommandOptionType.User,
      required: true,
    })
    user: User,
    interaction: CommandInteraction,
  ) {
    if (!interaction.guildId || !interaction.guild) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Get settings
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
      });

      if (!settings?.promotionChannelId || !settings?.promotionRecruitRoleId) {
        await interaction.editReply({
          content: "❌ Promotion system is not fully configured. Set both channel and role to enable.",
        });
        return;
      }

      // Get member
      const member = await interaction.guild.members.fetch(user.id);
      if (!member) {
        await interaction.editReply({
          content: "❌ User not found in this server.",
        });
        return;
      }

      // Check if user has recruit role
      if (!member.roles.cache.has(settings.promotionRecruitRoleId)) {
        await interaction.editReply({
          content: `❌ <@${user.id}> does not have the recruit role (<@&${settings.promotionRecruitRoleId}>).`,
        });
        return;
      }

      // Check if already promoted
      const existingPromotion = await (prisma as any).voicePatrolPromotion.findUnique({
        where: { guildId_userId: { guildId: interaction.guildId, userId: user.id } },
      });

      if (existingPromotion) {
        await interaction.editReply({
          content: `ℹ️ <@${user.id}> has already been promoted (notified on <t:${Math.floor(existingPromotion.notifiedAt.getTime() / 1000)}:F>).`,
        });
        return;
      }

      // Get total hours
      const minHours = settings.promotionMinHours ?? 4;
      const totalTime = await patrolTimer.getUserTotal(interaction.guildId, user.id);
      const totalHours = totalTime / (1000 * 60 * 60);

      // Check if meets criteria
      if (totalHours < minHours) {
        await interaction.editReply({
          content: `❌ <@${user.id}> does not meet the minimum hours requirement.\n**Current:** ${totalHours.toFixed(2)} hours\n**Required:** ${minHours} hours`,
        });
        return;
      }

      // Get promotion channel
      const channel = await interaction.guild.channels.fetch(settings.promotionChannelId);
      if (!channel || !channel.isTextBased()) {
        await interaction.editReply({
          content: `❌ Promotion channel <#${settings.promotionChannelId}> not found or is not a text channel.`,
        });
        return;
      }

      // Send promotion notification with reactions
      const message = `<@${user.id}>\nRecruit > Deputy\nAttended ${Math.floor(totalHours)}+ hours and been in 2+ patrols.`;
      const sentMessage = await channel.send(message);
      
      // Add reactions
      await sentMessage.react('✅');
      await sentMessage.react('❌');

      // Record the promotion
      await (prisma as any).voicePatrolPromotion.create({
        data: {
          guildId: interaction.guildId,
          userId: user.id,
          totalHours,
        },
      });

      await interaction.editReply({
        content: `✅ Promotion notification sent for <@${user.id}> in <#${settings.promotionChannelId}> (${totalHours.toFixed(2)} hours).`,
      });

      loggers.patrol.info(`Manual promotion check for ${user.tag} by ${interaction.user.tag} (${totalHours.toFixed(2)}h)`);
    } catch (err) {
      loggers.patrol.error("Manual promotion check error", err);
      await interaction.editReply({
        content: "❌ An error occurred while checking for promotion. Please check the logs.",
      });
    }
  }

  @Slash({
    name: "check-all",
    description: "Check all users with recruit role for promotion eligibility",
  })
  async checkAll(interaction: CommandInteraction) {
    if (!interaction.guildId || !interaction.guild) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Get settings
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
      });

      if (!settings?.promotionChannelId || !settings?.promotionRecruitRoleId) {
        await interaction.editReply({
          content: "❌ Promotion system is not fully configured. Set both channel and role to enable.",
        });
        return;
      }

      const minHours = settings.promotionMinHours ?? 4;

      // Get promotion channel
      const channel = await interaction.guild.channels.fetch(settings.promotionChannelId);
      if (!channel || !channel.isTextBased()) {
        await interaction.editReply({
          content: `❌ Promotion channel <#${settings.promotionChannelId}> not found or is not a text channel.`,
        });
        return;
      }

      // Get all members with the recruit role
      const role = await interaction.guild.roles.fetch(settings.promotionRecruitRoleId);
      if (!role) {
        await interaction.editReply({
          content: `❌ Recruit role <@&${settings.promotionRecruitRoleId}> not found.`,
        });
        return;
      }

      // Fetch all members to ensure we have the full list
      await interaction.guild.members.fetch();

      const recruits = role.members;
      if (recruits.size === 0) {
        await interaction.editReply({
          content: `ℹ️ No users currently have the recruit role (<@&${settings.promotionRecruitRoleId}>).`,
        });
        return;
      }

      // Get all existing promotions
      const existingPromotions = await (prisma as any).voicePatrolPromotion.findMany({
        where: { guildId: interaction.guildId },
      });
      const promotedUserIds = new Set(existingPromotions.map((p: any) => p.userId));

      // Check each recruit
      const eligible: Array<{ userId: string; hours: number }> = [];
      const ineligible: Array<{ userId: string; hours: number }> = [];
      const alreadyPromoted: string[] = [];

      for (const [userId, member] of recruits) {
        // Skip bots
        if (member.user.bot) continue;

        // Check if already promoted
        if (promotedUserIds.has(userId)) {
          alreadyPromoted.push(userId);
          continue;
        }

        // Get total hours
        const totalTime = await patrolTimer.getUserTotal(interaction.guildId, userId);
        const totalHours = totalTime / (1000 * 60 * 60);

        if (totalHours >= minHours) {
          eligible.push({ userId, hours: totalHours });
        } else {
          ineligible.push({ userId, hours: totalHours });
        }
      }

      // Build summary message
      let summary = `**Promotion Check Results**\n\n`;
      summary += `**Eligible for Promotion:** ${eligible.length}\n`;
      summary += `**Not Yet Eligible:** ${ineligible.length}\n`;
      summary += `**Already Promoted:** ${alreadyPromoted.length}\n`;
      summary += `**Total Recruits:** ${recruits.size}\n\n`;

      if (eligible.length > 0) {
        summary += `**Eligible Users:**\n`;
        for (const { userId, hours } of eligible) {
          summary += `• <@${userId}> — ${hours.toFixed(2)} hours\n`;
        }
        summary += `\nUse \`/settings patrol promotion check <user>\` to promote them individually.`;
      }

      await interaction.editReply({ content: summary });

      loggers.patrol.info(`Bulk promotion check by ${interaction.user.tag}: ${eligible.length} eligible, ${ineligible.length} not eligible, ${alreadyPromoted.length} already promoted`);
    } catch (err) {
      loggers.patrol.error("Bulk promotion check error", err);
      await interaction.editReply({
        content: "❌ An error occurred while checking promotions. Please check the logs.",
      });
    }
  }
}
