import { Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";
import {
  CommandInteraction,
  ChannelType,
  ApplicationCommandOptionType,
  GuildBasedChannel,
  MessageFlags,
} from "discord.js";
import { StaffGuard } from "../../../utility/guards.js";
import { prisma } from "../../../main.js";
import { loggers } from "../../../utility/logger.js";

@Discord()
@SlashGroup({ name: "whitelist", description: "Whitelist settings", root: "settings" })
@SlashGroup("whitelist", "settings")
@Guard(StaffGuard)
export class WhitelistSettingsCommand {
  @Slash({
    name: "log-channel",
    description: "Set the channel for whitelist verification and modification logs",
  })
  async logChannel(
    @SlashOption({
      name: "channel",
      description: "The channel to send whitelist logs to",
      type: ApplicationCommandOptionType.Channel,
      channelTypes: [ChannelType.GuildText],
      required: false,
    })
    channel: GuildBasedChannel | null,
    interaction: CommandInteraction,
  ): Promise<void> {
    try {
      if (!interaction.guildId) {
        await interaction.reply({
          content: "❌ This command can only be used in a server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // If no channel provided, show current setting
      if (!channel) {
        const settings = await prisma.guildSettings.findUnique({
          where: { guildId: interaction.guildId },
        });

        if (!settings?.whitelistLogChannelId) {
          await interaction.reply({
            content: "ℹ️ No whitelist log channel is currently configured.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.reply({
          content: `ℹ️ Whitelist log channel is currently set to <#${settings.whitelistLogChannelId}>`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Update the setting
      await prisma.guildSettings.upsert({
        where: { guildId: interaction.guildId },
        update: {
          whitelistLogChannelId: channel.id,
        },
        create: {
          guildId: interaction.guildId,
          whitelistLogChannelId: channel.id,
        },
      });

      await interaction.reply({
        content: `✅ Whitelist log channel has been set to <#${channel.id}>`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error: unknown) {
      loggers.bot.error("Error setting log channel", error);
      await interaction.reply({
        content: `❌ Failed to set log channel: ${error instanceof Error ? error.message : "Unknown error"}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  @Slash({
    name: "clear-log-channel",
    description: "Remove the whitelist log channel setting",
  })
  async clearLogChannel(interaction: CommandInteraction): Promise<void> {
    try {
      if (!interaction.guildId) {
        await interaction.reply({
          content: "❌ This command can only be used in a server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
      });

      if (!settings?.whitelistLogChannelId) {
        await interaction.reply({
          content: "ℹ️ No whitelist log channel is currently configured.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await prisma.guildSettings.update({
        where: { guildId: interaction.guildId },
        data: {
          whitelistLogChannelId: null,
        },
      });

      await interaction.reply({
        content: "✅ Whitelist log channel has been cleared.",
        flags: MessageFlags.Ephemeral,
      });
    } catch (error: unknown) {
      loggers.bot.error(
        "Error clearing log channel",
        error,
      );
      await interaction.reply({
        content: `❌ Failed to clear log channel: ${error instanceof Error ? error.message : "Unknown error"}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
