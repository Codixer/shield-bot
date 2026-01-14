import { Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";
import {
  CommandInteraction,
  MessageFlags,
  ApplicationCommandOptionType,
  Role,
  ChannelType,
  TextChannel,
  NewsChannel,
} from "discord.js";
import { StaffGuard } from "../../../utility/guards.js";
import { prisma } from "../../../main.js";

@Discord()
@SlashGroup({
  description: "LOA settings",
  name: "loa",
  root: "settings",
})
@SlashGroup("loa", "settings")
@Guard(StaffGuard)
export class SettingsLOASubGroup {
  @Slash({
    name: "role",
    description: "Set the LOA role for this guild",
  })
  async setRole(
    @SlashOption({
      name: "role",
      description: "The role to assign to users on LOA",
      type: ApplicationCommandOptionType.Role,
      required: true,
    })
    role: Role,
    interaction: CommandInteraction,
  ) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await prisma.guildSettings.upsert({
      where: { guildId: interaction.guildId },
      update: { loaRoleId: role.id },
      create: {
        guildId: interaction.guildId,
        loaRoleId: role.id,
      },
    });

    await interaction.reply({
      content: `✅ LOA role set to: ${role.name} (<@&${role.id}>)`,
      flags: MessageFlags.Ephemeral,
    });
  }

  @Slash({
    name: "notification-channel",
    description: "Set the channel for LOA patrol notifications",
  })
  async setNotificationChannel(
    @SlashOption({
      name: "channel",
      description: "The channel where staff will be notified when users on LOA join patrol",
      type: ApplicationCommandOptionType.Channel,
      required: true,
    })
    channel: TextChannel | NewsChannel,
    interaction: CommandInteraction,
  ) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
      await interaction.reply({
        content: "❌ The channel must be a text channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await prisma.guildSettings.upsert({
      where: { guildId: interaction.guildId },
      update: { loaNotificationChannelId: channel.id },
      create: {
        guildId: interaction.guildId,
        loaNotificationChannelId: channel.id,
      },
    });

    await interaction.reply({
      content: `✅ LOA notification channel set to: <#${channel.id}>`,
      flags: MessageFlags.Ephemeral,
    });
  }

  @Slash({
    name: "cooldown-days",
    description: "Set the cooldown period (in days) after ending an LOA early",
  })
  async setCooldownDays(
    @SlashOption({
      name: "days",
      description: "Number of days for the cooldown period (default: 14)",
      type: ApplicationCommandOptionType.Integer,
      required: true,
      minValue: 1,
      maxValue: 365,
    })
    days: number,
    interaction: CommandInteraction,
  ) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await prisma.guildSettings.upsert({
      where: { guildId: interaction.guildId },
      update: { leaveOfAbsenceCooldownDays: days },
      create: {
        guildId: interaction.guildId,
        leaveOfAbsenceCooldownDays: days,
      },
    });

    await interaction.reply({
      content: `✅ LOA cooldown period set to ${days} day${days !== 1 ? "s" : ""}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  @Slash({
    name: "minimum-request-time",
    description: "Set the minimum LOA duration (in days) that users can request",
  })
  async setMinimumRequestTime(
    @SlashOption({
      name: "days",
      description: "Minimum number of days for LOA requests (default: 30)",
      type: ApplicationCommandOptionType.Integer,
      required: true,
      minValue: 1,
      maxValue: 365,
    })
    days: number,
    interaction: CommandInteraction,
  ) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await prisma.guildSettings.upsert({
      where: { guildId: interaction.guildId },
      update: { minimumRequestTimeDays: days },
      create: {
        guildId: interaction.guildId,
        minimumRequestTimeDays: days,
      },
    });

    await interaction.reply({
      content: `✅ Minimum LOA request time set to ${days} day${days !== 1 ? "s" : ""}.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
