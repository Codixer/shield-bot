import {
  Discord,
  Slash,
  SlashGroup,
  Guard,
  SlashOption,
} from "discordx";
import {
  CommandInteraction,
  ApplicationCommandOptionType,
  InteractionContextType,
  ApplicationIntegrationType,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Colors,
  ActionRowBuilder,
} from "discord.js";
import { VRChatLoginGuard } from "../../../utility/guards.js";
import { StaffGuard } from "../../../utility/guards.js";
import { prisma } from "../../../main.js";

@Discord()
@SlashGroup({
  name: "vrchat",
  description: "VRChat related commands.",
  contexts: [InteractionContextType.Guild],
  integrationTypes: [ApplicationIntegrationType.GuildInstall],
})
@SlashGroup("vrchat")
@Guard(VRChatLoginGuard, StaffGuard)
export class VRChatAvatarInviteCommand {
  @Slash({
    name: "avatar-invite",
    description: "Send a message allowing users to request an invite to an avatar world",
  })
  async avatarInvite(
      @SlashOption({
        name: "channel",
        description: "Channel to mention for verification instructions",
        type: ApplicationCommandOptionType.Channel,
        required: true,
      })
      channel: any,
    interaction: CommandInteraction,
  ) {
    await interaction.deferReply();

    if (!interaction.guildId) {
      await interaction.editReply({
        content: "❌ This command can only be used in a server.",
      });
      return;
    }

    // Get guild settings to retrieve the avatar world ID
    const guildSettings = await prisma.guildSettings.findUnique({
      where: { guildId: interaction.guildId },
    });

    if (!guildSettings || !guildSettings.avatarWorldId) {
      await interaction.editReply({
        content:
          "❌ Avatar world ID is not configured for this server. Please contact a developer to set it up.",
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🌍 Request Avatar World Invite")
      .setDescription(
        `Click the button below to request an invite to this avatar world.\n\n` +
        `**Requirements:**\n` +
        `• You must be verified with the bot (run \`/verify account\` in ${channel})\n` +
        `• You must be friends with the bot on VRChat\n\n` +
        `Once you meet these requirements, the bot will create an instance and send you an invite!`
      )
      .setColor(Colors.Blue)
      .setFooter({ text: "S.H.I.E.L.D. Bot - Instance System" });

    const button = new ButtonBuilder()
      .setCustomId(`avatar-invite-join:${guildSettings.avatarWorldId}`)
      .setLabel("Request Invite to Avatar World")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎭");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  }
}
