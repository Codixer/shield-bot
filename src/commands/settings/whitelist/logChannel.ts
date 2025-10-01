import { Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";
import {
  CommandInteraction,
  ChannelType,
  ApplicationCommandOptionType,
} from "discord.js";
import { DevGuardAndStaffGuard } from "../../../utility/guards.js";
import { prisma } from "../../../main.js";

@Discord()
@SlashGroup({ name: "whitelist", description: "Whitelist settings" })
@SlashGroup("whitelist", "settings")
@Guard(DevGuardAndStaffGuard)
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
    channel: any,
    interaction: CommandInteraction,
  ): Promise<void> {
    try {
      if (!interaction.guildId) {
        await interaction.reply({
          content: "❌ This command can only be used in a server.",
          ephemeral: true,
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
            ephemeral: true,
          });
          return;
        }

        await interaction.reply({
          content: `ℹ️ Whitelist log channel is currently set to <#${settings.whitelistLogChannelId}>`,
          ephemeral: true,
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
        ephemeral: true,
      });
    } catch (error: any) {
      console.error("[WhitelistSettings] Error setting log channel:", error);
      await interaction.reply({
        content: `❌ Failed to set log channel: ${error.message}`,
        ephemeral: true,
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
          ephemeral: true,
        });
        return;
      }

      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
      });

      if (!settings?.whitelistLogChannelId) {
        await interaction.reply({
          content: "ℹ️ No whitelist log channel is currently configured.",
          ephemeral: true,
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
        ephemeral: true,
      });
    } catch (error: any) {
      console.error(
        "[WhitelistSettings] Error clearing log channel:",
        error,
      );
      await interaction.reply({
        content: `❌ Failed to clear log channel: ${error.message}`,
        ephemeral: true,
      });
    }
  }
}
