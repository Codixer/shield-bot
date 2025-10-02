import {
  ButtonInteraction,
  MessageFlags,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { Discord, ButtonComponent } from "discordx";
import { ButtonBuilder } from "discord.js";
import { prisma } from "../../../../../main.js";
import { getUserById } from "../../../../../utility/vrchat.js";

@Discord()
export class VRChatStatusVerifyButtonHandler {
  @ButtonComponent({ id: /vrchat-status:(\d+):([a-zA-Z0-9\-_]+)/ })
  async handleStatusMethod(interaction: ButtonInteraction) {
    const parts = interaction.customId.split(":");
    const discordId = parts[1];
    const vrcUserId = parts[2];

    // TODO: Generate and store a unique verification code for this user in the database
    const verificationCode = Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase();
    await prisma.vRChatAccount.updateMany({
      where: { vrcUserId },
      data: { verificationCode },
    });
    const embed = new EmbedBuilder()
      .setTitle("Change Status to Verify")
      .setDescription(
        `To verify, change your VRChat status to the following code:\n\n**${verificationCode}**\n\nOnce you've changed your status, click **Verify status** below.`,
      )
      .setColor(0xfee75c);
    const verifyBtn = new ButtonBuilder()
      .setCustomId(`vrchat-status-verify:${discordId}:${vrcUserId}`)
      .setLabel("Verify status")
      .setStyle(ButtonStyle.Success);

    await interaction.update({
      embeds: [embed],
      components: [{ type: 1, components: [verifyBtn] }],
    });
  }

  @ButtonComponent({ id: /vrchat-status-verify:(\d+):([a-zA-Z0-9\-_]+)/ })
  async handleStatusVerify(interaction: ButtonInteraction) {
    const parts = interaction.customId.split(":");
    const discordId = parts[1];
    const vrcUserId = parts[2];
    // Fetch the VRChatAccount to get the verification code, ensure it's linked to this Discord user
    const vrcAccount = await prisma.vRChatAccount.findFirst({
      where: {
        vrcUserId,
        user: { discordId },
      },
      include: { user: true },
    });
    if (!vrcAccount || !vrcAccount.verificationCode) {
      const embed = new EmbedBuilder()
        .setTitle("Verification Error")
        .setDescription(
          "No verification code found for this account, or this account is not linked to your Discord user. Please restart the verification process.",
        )
        .setColor(0xed4245);
      await interaction.update({
        embeds: [embed],
        components: [],
      });
      return;
    }
    // Fetch the VRChat user info
    let userInfo: any = null;
    try {
      userInfo = await getUserById(vrcUserId);
    } catch (e) {
      userInfo = null;
    }
    if (!userInfo || !userInfo.statusDescription) {
      const embed = new EmbedBuilder()
        .setTitle("Status Fetch Error")
        .setDescription(
          "Could not fetch VRChat user status. Please try again later.",
        )
        .setColor(0xed4245);
      await interaction.update({
        embeds: [embed],
        components: [],
      });
      return;
    }
    // Check if the statusDescription contains the verification code
    if (userInfo.statusDescription.includes(vrcAccount.verificationCode)) {
      // Update username cache and promote from IN_VERIFICATION to MAIN/ALT
      const vrchatUsername = userInfo?.displayName || userInfo?.username;

      // Determine final account type based on whether user has a MAIN account
      const hasMainAccount = await prisma.vRChatAccount.findFirst({
        where: { userId: vrcAccount.userId, accountType: "MAIN" },
      });
      const finalAccountType = hasMainAccount ? "ALT" : "MAIN";

      await prisma.vRChatAccount.update({
        where: { id: vrcAccount.id },
        data: {
          accountType: finalAccountType,
          verificationCode: null,
          verificationGuildId: null, // Clear guild ID after verification is complete
          vrchatUsername,
          usernameUpdatedAt: new Date(),
        },
      });

      const embed = new EmbedBuilder()
        .setTitle("Verification Successful")
        .setDescription(
          `Your VRChat account (**${vrchatUsername || vrcUserId}**) has been successfully verified via status change!\n\n✅ Your account is now fully verified and protected from takeover.`,
        )
        .setColor(0x57f287);
      await interaction.update({
        embeds: [embed],
        components: [],
      });
    } else {
      const embed = new EmbedBuilder()
        .setTitle("Verification Failed")
        .setDescription(
          "Verification failed. The code was not found in your VRChat status. Please make sure you have set your status correctly and try again.",
        )
        .setColor(0xed4245);
      await interaction.update({
        embeds: [embed],
        components: [],
      });
    }
  }
}
