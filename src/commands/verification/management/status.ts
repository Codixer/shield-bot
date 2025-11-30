import { Discord, Slash, SlashOption, Guard, SlashGroup } from "discordx";
import {
  CommandInteraction,
  ApplicationCommandOptionType,
  MessageFlags,
  EmbedBuilder,
  Colors,
  AutocompleteInteraction,
  InteractionContextType,
  ApplicationIntegrationType,
} from "discord.js";
import { VRChatLoginGuard } from "../../../utility/guards.js";
import { getUserById, searchUsers } from "../../../utility/vrchat.js";
import { prisma } from "../../../main.js";
import type { VRChatUser } from "../../../utility/vrchat/types.js";

@Discord()
@SlashGroup({
  name: "verify",
  description: "VRChat verification commands.",
  contexts: [
    InteractionContextType.Guild,
  ],
  integrationTypes: [
    ApplicationIntegrationType.GuildInstall,
  ],
})
@SlashGroup("verify")
@Guard(VRChatLoginGuard)
export class VRChatVerifyStatusCommand {
  @Slash({
    name: "status",
    description: "Check verification status of a VRChat account.",
  })
  async status(
    @SlashOption({
      name: "vrc_user",
      description: "Search for a VRChat username or user ID",
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    })
    userIdOpt: string,
    interaction: CommandInteraction | AutocompleteInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      return this.autocompleteVerifyVrchatUser(interaction);
    }

    if (!interaction.isCommand()) {
      return;
    }

    const userId = userIdOpt;
    if (!userId || typeof userId !== "string") {
      await interaction.reply({
        content: `No VRChat user ID provided. Please try again.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Fetch user details from VRChat API using the userId directly
    let userInfo: VRChatUser | null = null;
    try {
      userInfo = await getUserById(userId);
    } catch {
      userInfo = null;
    }
    if (!userInfo) {
      await interaction.reply({
        content: `Could not fetch VRChat user details. Please try again or check the user ID.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check verification status in database
    const vrchatAccount = await prisma.vRChatAccount.findFirst({
      where: {
        vrcUserId: userId,
      },
    });

    let statusText = "Not verified";
    let statusColor: number = Colors.Red;
    let statusEmoji = "❌";

    if (vrchatAccount) {
      if (
        vrchatAccount.accountType === "MAIN" ||
        vrchatAccount.accountType === "ALT"
      ) {
        statusText = "Verified";
        statusColor = Colors.Green;
        statusEmoji = "✅";
      } else if (vrchatAccount.accountType === "IN_VERIFICATION") {
        statusText = "In verification";
        statusColor = Colors.Yellow;
        statusEmoji = "⏳";
      } else {
        statusText = "Unverified";
        statusColor = Colors.Orange;
        statusEmoji = "⚠️";
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`${statusEmoji} Verification Status`)
      .setDescription(
        `**${userInfo.displayName}** (${userInfo.id})\n\n**Status:** ${statusText}`,
      )
      .setColor(statusColor)
      .setImage(
        userInfo.profilePicOverride ||
          userInfo.currentAvatarImageUrl ||
          userInfo.currentAvatarThumbnailImageUrl ||
          null,
      )
      .setThumbnail(userInfo.userIcon || userInfo.profilePicOverride || null)
      .setFooter({ text: "VRChat Verification Status" });

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }

  async autocompleteVerifyVrchatUser(interaction: AutocompleteInteraction) {
    const query = interaction.options.getFocused();
    if (!query || query.length < 2) {
      return await interaction.respond([]);
    }
    try {
      const users = await searchUsers({ search: query, n: 25 });
      const choices = users.map((user: VRChatUser) => ({
        name: `${user.displayName} (${user.id})`,
        value: user.id,
      }));
      return await interaction.respond(choices);
    } catch {
      return await interaction.respond([]);
    }
  }
}
