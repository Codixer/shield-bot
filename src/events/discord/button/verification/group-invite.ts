import {
  ButtonInteraction,
  MessageFlags,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { Discord, ButtonComponent } from "discordx";
import { prisma } from "../../../../main.js";
import { inviteUserToGroup } from "../../../../utility/vrchat/groups.js";

@Discord()
export class VRChatGroupInviteButtonHandler {
  @ButtonComponent({ id: /grp-inv:(\d+):([a-zA-Z0-9\-_]+)/ })
  async handleGroupInvite(interaction: ButtonInteraction) {
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

    // Get the VRChat group ID from guild settings
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
      // Send group invite
      await inviteUserToGroup(guildSettings.vrcGroupId, vrcUserId);

      const embed = new EmbedBuilder()
        .setTitle("✅ Group Invite Sent!")
        .setDescription(
          `A group invite has been sent to your VRChat account!\n\n**Account:** ${vrcAccount.vrchatUsername || vrcUserId}\n\nCheck your VRChat notifications to accept the invite.`,
        )
        .setColor(Colors.Green)
        .setFooter({ text: "S.H.I.E.L.D. Bot - Group Management" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      console.error("[Group Invite] Error sending group invite:", error);

      let errorMessage = "Failed to send group invite. Please try again later.";
      if (error.message?.includes("400")) {
        errorMessage =
          "You may already be in the group, have a pending invite, or the group settings don't allow invites.";
      } else if (error.message?.includes("404")) {
        errorMessage = "The VRChat group was not found.";
      }

      const embed = new EmbedBuilder()
        .setTitle("❌ Group Invite Failed")
        .setDescription(errorMessage)
        .setColor(Colors.Red)
        .setFooter({ text: "S.H.I.E.L.D. Bot - Group Management" });

      await interaction.editReply({ embeds: [embed] });
    }
  }
}
