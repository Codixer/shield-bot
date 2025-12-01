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
import { VRChatError } from "../../../../utility/errors.js";

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
    } catch (error: unknown) {
      loggers.vrchat.error("Error syncing roles", error);

      let errorMessage = "";
      let shouldContactDevTeam = false;
      let reason = "";

      // Handle VRChat API errors
      if (error instanceof VRChatError) {
        const statusCode = error.statusCode;
        
        if (statusCode === 401 || statusCode === 403) {
          reason = `The bot does not have permission to manage VRChat group roles. (HTTP ${statusCode})`;
          errorMessage = `❌ **Permission Error**\n\n${reason}\n\nThis is a configuration issue that requires developer attention.`;
          shouldContactDevTeam = true;
        } else if (statusCode === 404) {
          reason = "The VRChat group or user could not be found. (HTTP 404)";
          errorMessage = `❌ **Not Found**\n\n${reason}\n\nPlease verify your account is connected to the correct VRChat group.`;
        } else if (statusCode && statusCode >= 500) {
          reason = `VRChat API server error occurred. (HTTP ${statusCode})`;
          errorMessage = `❌ **VRChat Service Error**\n\n${reason}\n\nThis appears to be a temporary issue with VRChat's servers. Please try again later.`;
        } else {
          reason = error.message || `Unknown VRChat API error (HTTP ${statusCode || "unknown"})`;
          errorMessage = `❌ **API Error**\n\n${reason}\n\nIf this issue persists, please contact the development team.`;
          shouldContactDevTeam = true;
        }
      }
      // Handle generic errors with specific messages
      else if (error instanceof Error) {
        const message = error.message.toLowerCase();
        
        if (message.includes("not a member of the vrchat group") || message.includes("join the group")) {
          reason = "You are not currently a member of the VRChat group.";
          errorMessage = `❌ **Not a Group Member**\n\n${reason}\n\nPlease join the VRChat group first, then try syncing your roles again.`;
        } else if (message.includes("cannot manage") || message.includes("higher than the bot")) {
          reason = "Your VRChat role is equal to or higher than the bot's role in the group hierarchy, so the bot cannot modify your roles.";
          errorMessage = `❌ **Insufficient Permissions**\n\n${reason}\n\nThis is expected for members with high-ranking roles. If you believe this is an error, please contact the development team.`;
          shouldContactDevTeam = true;
        } else if (message.includes("failed to update") || message.includes("failed to add") || message.includes("failed to remove")) {
          reason = error.message;
          errorMessage = `❌ **Role Update Failed**\n\n${reason}\n\nPlease contact the development team for assistance.`;
          shouldContactDevTeam = true;
        } else if (message.includes("not in group")) {
          reason = "You are not a member of the VRChat group yet.";
          errorMessage = `❌ **Not a Group Member**\n\n${reason}\n\nPlease join the VRChat group first, then try syncing your roles again.`;
        } else {
          reason = error.message || "An unexpected error occurred while syncing roles.";
          errorMessage = `❌ **Sync Failed**\n\n**Reason:** ${reason}\n\nPlease contact the development team for assistance.`;
          shouldContactDevTeam = true;
        }
      }
      // Handle unknown errors
      else {
        reason = "An unknown error occurred while syncing roles.";
        errorMessage = `❌ **Unknown Error**\n\n${reason}\n\nPlease contact the development team for assistance.`;
        shouldContactDevTeam = true;
      }

      // Build the error embed
      const embed = new EmbedBuilder()
        .setTitle("❌ Role Sync Failed")
        .setDescription(errorMessage)
        .setColor(Colors.Red)
        .setFooter({ text: "S.H.I.E.L.D. Bot - Group Role Sync" });

      // Add contact instructions if needed
      if (shouldContactDevTeam) {
        embed.addFields({
          name: "Need Help?",
          value: "If this issue persists, please contact the development team with the error details above.",
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    }
  }
}
