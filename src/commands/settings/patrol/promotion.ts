import { Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";
import {
  CommandInteraction,
  MessageFlags,
  ApplicationCommandOptionType,
  Channel,
  Role,
  ChannelType,
} from "discord.js";
import { prisma } from "../../../main.js";
import { StaffGuard } from "../../../utility/guards.js";

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
}
