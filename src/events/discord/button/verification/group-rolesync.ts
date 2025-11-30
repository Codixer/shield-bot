import {
  ButtonInteraction,
  MessageFlags,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { Discord, ButtonComponent } from "discordx";
import { prisma } from "../../../../main.js";
import { groupRoleSyncManager } from "../../../../managers/groupRoleSync/groupRoleSyncManager.js";
import { loggers } from "../../../../utility/logger.js";

@Discord()
export class VRChatGroupRoleSyncButtonHandler {
  @ButtonComponent({ id: /grp-sync:(\d+):([a-zA-Z0-9\-_]+)/ })
  async handleGroupRoleSync(interaction: ButtonInteraction) {
    const parts = interaction.customId.split(":");
    const discordId = parts[1];
    const vrcUserId = parts[2];

    // Verify this is the correct user
    if (interaction.user.id !== discordId) {
      await interaction.reply({
        content: "❌ This button is not for you.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Verify the account is verified and belongs to this user
    const vrcAccount = await prisma.vRChatAccount.findFirst({
      where: {
        vrcUserId,
        user: { discordId },
        accountType: { in: ["MAIN", "ALT"] },
      },
    });

    if (!vrcAccount) {
      await interaction.reply({
        content:
          "❌ VRChat account not found or not verified. Please verify your account first using `/verify account`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get the guild ID from settings
    const guildSettings = await prisma.guildSettings.findFirst({
      where: { vrcGroupId: { not: null } },
    });

    if (!guildSettings?.vrcGroupId) {
      await interaction.reply({
        content: "❌ No VRChat group configured.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Sync roles
      await groupRoleSyncManager.syncUserRoles(
        guildSettings.guildId,
        discordId,
        vrcUserId,
      );

      const embed = new EmbedBuilder()
        .setTitle("✅ Roles Synced!")
        .setDescription(
          `Your VRChat group roles have been synchronized with your Discord roles.\n\n**Account:** ${vrcAccount.vrchatUsername || vrcUserId}`,
        )
        .setColor(Colors.Green)
        .setFooter({ text: "S.H.I.E.L.D. Bot - Group Role Sync" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      loggers.vrchat.error("Error syncing roles", error);

      let errorMessage = "Failed to sync roles. Please try again later.";
      if (error.message?.includes("not in group")) {
        errorMessage =
          "You are not a member of the VRChat group yet. Please join the group first.";
      } else if (error.message?.includes("403") || error.message?.includes("401")) {
        errorMessage = "Bot does not have permission to manage group roles.";
      }

      const embed = new EmbedBuilder()
        .setTitle("❌ Role Sync Failed")
        .setDescription(errorMessage)
        .setColor(Colors.Red)
        .setFooter({ text: "S.H.I.E.L.D. Bot - Group Role Sync" });

      await interaction.editReply({ embeds: [embed] });
    }
  }
}
