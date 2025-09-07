import { ButtonInteraction, MessageFlags, EmbedBuilder, Colors } from "discord.js";
import { Discord, ButtonComponent } from "discordx";
import { prisma } from "../../../../main.js";
import { getUserById } from "../../../../utility/vrchat.js";

@Discord()
export class VRChatVerifyManagerButtonHandler {

  @ButtonComponent({
    id: /^verify-account:([a-zA-Z0-9\-_]+)$/
  })
  async handleVerifyAccount(interaction: ButtonInteraction) {
    const vrcUserId = interaction.customId.split(":")[1];
    const discordId = interaction.user.id;

    try {
      // Find the VRChat account
      const vrchatAccount = await prisma.vRChatAccount.findFirst({
        where: {
          vrcUserId,
          user: { discordId }
        }
      });

      if (!vrchatAccount) {
        await interaction.reply({
          content: "❌ VRChat account not found.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Update to verified (MAIN if no main exists, otherwise ALT)
      const hasMainAccount = await prisma.vRChatAccount.findFirst({
        where: {
          user: { discordId },
          accountType: "MAIN"
        }
      });

      const newAccountType = hasMainAccount ? "ALT" : "MAIN";

      await prisma.vRChatAccount.update({
        where: { id: vrchatAccount.id },
        data: { accountType: newAccountType }
      });

      // Get user info for display
      let userInfo = null;
      try {
        userInfo = await getUserById(vrcUserId);
      } catch (e) {
        // Ignore errors
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Account Verified")
        .setDescription(`**${userInfo?.displayName || vrcUserId}** has been verified as **${newAccountType}**.`)
        .setColor(Colors.Green)
        .setFooter({ text: "VRChat Verification Management" });

      await interaction.update({
        embeds: [embed],
        components: []
      });

    } catch (error) {
      console.error("Error verifying account:", error);
      await interaction.reply({
        content: "❌ An error occurred while verifying the account.",
        flags: MessageFlags.Ephemeral
      });
    }
  }

  @ButtonComponent({
    id: /^set-main:([a-zA-Z0-9\-_]+)$/
  })
  async handleSetMain(interaction: ButtonInteraction) {
    const vrcUserId = interaction.customId.split(":")[1];
    const discordId = interaction.user.id;

    try {
      // Find the VRChat account
      const vrchatAccount = await prisma.vRChatAccount.findFirst({
        where: {
          vrcUserId,
          user: { discordId }
        }
      });

      if (!vrchatAccount) {
        await interaction.reply({
          content: "❌ VRChat account not found.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Set any existing MAIN to ALT
      await prisma.vRChatAccount.updateMany({
        where: {
          user: { discordId },
          accountType: "MAIN"
        },
        data: { accountType: "ALT" }
      });

      // Set this account as MAIN
      await prisma.vRChatAccount.update({
        where: { id: vrchatAccount.id },
        data: { accountType: "MAIN" }
      });

      // Get user info for display
      let userInfo = null;
      try {
        userInfo = await getUserById(vrcUserId);
      } catch (e) {
        // Ignore errors
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Account Set as Main")
        .setDescription(`**${userInfo?.displayName || vrcUserId}** is now your **MAIN** account.`)
        .setColor(Colors.Green)
        .setFooter({ text: "VRChat Account Management" });

      await interaction.update({
        embeds: [embed],
        components: []
      });

    } catch (error) {
      console.error("Error setting main account:", error);
      await interaction.reply({
        content: "❌ An error occurred while setting the main account.",
        flags: MessageFlags.Ephemeral
      });
    }
  }

  @ButtonComponent({
    id: /^set-alt:([a-zA-Z0-9\-_]+)$/
  })
  async handleSetAlt(interaction: ButtonInteraction) {
    const vrcUserId = interaction.customId.split(":")[1];
    const discordId = interaction.user.id;

    try {
      // Find the VRChat account
      const vrchatAccount = await prisma.vRChatAccount.findFirst({
        where: {
          vrcUserId,
          user: { discordId }
        }
      });

      if (!vrchatAccount) {
        await interaction.reply({
          content: "❌ VRChat account not found.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Set this account as ALT
      await prisma.vRChatAccount.update({
        where: { id: vrchatAccount.id },
        data: { accountType: "ALT" }
      });

      // Get user info for display
      let userInfo = null;
      try {
        userInfo = await getUserById(vrcUserId);
      } catch (e) {
        // Ignore errors
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Account Set as Alt")
        .setDescription(`**${userInfo?.displayName || vrcUserId}** is now an **ALT** account.`)
        .setColor(Colors.Green)
        .setFooter({ text: "VRChat Account Management" });

      await interaction.update({
        embeds: [embed],
        components: []
      });

    } catch (error) {
      console.error("Error setting alt account:", error);
      await interaction.reply({
        content: "❌ An error occurred while setting the alt account.",
        flags: MessageFlags.Ephemeral
      });
    }
  }

  @ButtonComponent({
    id: /^unverify-account:([a-zA-Z0-9\-_]+)$/
  })
  async handleUnverifyAccount(interaction: ButtonInteraction) {
    const vrcUserId = interaction.customId.split(":")[1];
    const discordId = interaction.user.id;

    try {
      // Find the VRChat account
      const vrchatAccount = await prisma.vRChatAccount.findFirst({
        where: {
          vrcUserId,
          user: { discordId }
        }
      });

      if (!vrchatAccount) {
        await interaction.reply({
          content: "❌ VRChat account not found.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Set this account as UNVERIFIED
      await prisma.vRChatAccount.update({
        where: { id: vrchatAccount.id },
        data: { accountType: "UNVERIFIED" }
      });

      // Get user info for display
      let userInfo = null;
      try {
        userInfo = await getUserById(vrcUserId);
      } catch (e) {
        // Ignore errors
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Account Unverified")
        .setDescription(`**${userInfo?.displayName || vrcUserId}** has been set to **UNVERIFIED**.`)
        .setColor(Colors.Orange)
        .setFooter({ text: "VRChat Account Management" });

      await interaction.update({
        embeds: [embed],
        components: []
      });

    } catch (error) {
      console.error("Error unverifying account:", error);
      await interaction.reply({
        content: "❌ An error occurred while unverifying the account.",
        flags: MessageFlags.Ephemeral
      });
    }
  }
}
