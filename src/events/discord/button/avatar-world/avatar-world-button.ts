import {
  ButtonInteraction,
  MessageFlags,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { Discord, ButtonComponent } from "discordx";
import { prisma } from "../../../../main.js";
import { vrchatApi } from "../../../../utility/vrchatClient.js";
import { InstanceRegionType, InstanceAccessNormalType } from "vrc-ts";
import type { WorldIdType } from "vrc-ts";

@Discord()
export class VRChatAvatarInviteButtonHandler {
  @ButtonComponent({ id: /^avatar-invite-join:(.+)$/ })
  async handleJoinInstance(interaction: ButtonInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const worldId = interaction.customId.split(":")[1];
    const discordId = interaction.user.id;

    try {
      // Get user's verified accounts
      const user = await prisma.user.findUnique({
        where: { discordId },
        include: {
          vrchatAccounts: {
            where: {
              accountType: { in: ["MAIN", "ALT"] },
            },
          },
        },
      });

      if (!user || !user.vrchatAccounts || user.vrchatAccounts.length === 0) {
        await interaction.editReply({
          content:
            "❌ You don't have any verified VRChat accounts. Please run `/verify account` first.",
        });
        return;
      }

      // Use the MAIN account, or first ALT if no MAIN exists
      const mainAccount = user.vrchatAccounts.find(
        (acc: any) => acc.accountType === "MAIN"
      );
      const vrcAccount = mainAccount || user.vrchatAccounts[0];

      // Check if user is friends with the bot
      const vrcUser = await vrchatApi.userApi.getUserById({ userId: vrcAccount.vrcUserId });

      if (!vrcUser || !vrcUser.isFriend) {
        await interaction.editReply({
          content:
            "❌ You must be friends with the bot to use this feature.\n\n" +
            "Please verify your account using the **friend request** method by running `/verify account` and selecting the friend request verification option.",
        });
        return;
      }

      // Check if user's status is "ask me" (orange/invite me)
      if (vrcUser.status !== "ask me") {
        const statusEmoji = {
          "active": "🟢",
          "join me": "🟢", 
          "ask me": "🟠",
          "busy": "🔴",
          "offline": "⚫"
        }[vrcUser.status] || "❓";

        await interaction.editReply({
          content:
            `❌ Your VRChat status must be set to **Ask Me** (🟠) to receive an invite.\n\n` +
            `Your current status: **${vrcUser.status}** ${statusEmoji}\n\n` +
            `Please change your status to "Ask Me" in VRChat and try again.`,
        });
        return;
      }

      // Create instance using vrc-ts
      const currentUser = await vrchatApi.authApi.getCurrentUser();
      const instance = await vrchatApi.instanceApi.generateNormalInstance({
        worldId: worldId as WorldIdType,
        instanceType: InstanceAccessNormalType.Invite,
        region: InstanceRegionType.US_EAST,
        ownerId: currentUser.id,
      });

      if (!instance || !instance.instanceId) {
        await interaction.editReply({
          content: "❌ Failed to create instance. Please try again later.",
        });
        return;
      }

      // Invite user to the instance
      await vrchatApi.inviteApi.inviteUser({
        userId: vrcAccount.vrcUserId,
        instanceId: instance.location,
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Instance Created & Invite Sent")
        .setDescription(
          `An instance has been created and an invite has been sent to your VRChat account.\n\n` +
          `**World:** ${(instance.world as any)?.name || worldId}\n` +
          `**Instance ID:** ${instance.shortName || instance.instanceId}\n\n` +
          `Check your VRChat notifications for the invite!`
        )
        .setColor(Colors.Green)
        .setFooter({ text: "S.H.I.E.L.D. Bot - Instance System" });

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      console.error("[Avatar Invite] Error creating instance:", error);
      await interaction.editReply({
        content:
          "❌ An error occurred while creating the instance. Please try again later or contact staff.",
      });
    }
  }
}
