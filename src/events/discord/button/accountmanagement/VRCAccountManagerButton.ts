import {
  ButtonInteraction,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { Discord, ButtonComponent } from "discordx";
import { prisma } from "../../../../main.js";
import { getUserById } from "../../../../utility/vrchat/user.js";
import { unfriendUser } from "../../../../utility/vrchat/user.js";
import { whitelistManager } from "../../../../managers/whitelist/whitelistManager.js";
import { sendWhitelistLog, getUserWhitelistRoles } from "../../../../utility/vrchat/whitelistLogger.js";
import { loggers } from "../../../../utility/logger.js";
import type { User, VRChatAccount } from "../../../../generated/prisma/client.js";

@Discord()
export class VRCAccountManagerButtonHandler {
  @ButtonComponent({
    id: /^accountmanager:(main|alt|delete):([a-zA-Z0-9\-_]+)$/,
  })
  async handleAccountManager(interaction: ButtonInteraction) {
    const parts = interaction.customId.split(":");
    const action = parts[1];
    const vrcUserId = parts[2];
    const discordId = interaction.user.id;

    if (!action || !vrcUserId) {
      await interaction.reply({
        content: "❌ Invalid button interaction data.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      // Get the user and their VRChat accounts
      const user = await prisma.user.findUnique({
        where: { discordId },
        include: { vrchatAccounts: true },
      });

      if (!user) {
        await interaction.reply({
          content: "❌ User not found in database.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Find the specific VRChat account
      const vrcAccount = user.vrchatAccounts.find(
        (acc) => acc.vrcUserId === vrcUserId,
      );
      if (!vrcAccount) {
        await interaction.reply({
          content:
            "❌ VRChat account not found or not linked to your Discord account.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      switch (action) {
        case "main":
          await this.handleSetMain(interaction, user, vrcAccount, vrcUserId);
          break;
        case "alt":
          await this.handleSetAlt(interaction, vrcAccount, vrcUserId);
          break;
        case "delete":
          await this.handleDelete(interaction, vrcAccount, vrcUserId);
          break;
        default:
          await interaction.reply({
            content: "❌ Unknown action.",
            flags: MessageFlags.Ephemeral,
          });
      }
    } catch (error) {
      loggers.bot.error("Error in account manager button handler", error);
      await interaction.reply({
        content:
          "❌ An error occurred while processing your request. Please try again later.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  private async handleSetMain(
    interaction: ButtonInteraction,
    user: User & { vrchatAccounts: VRChatAccount[] },
    vrcAccount: VRChatAccount,
    vrcUserId: string,
  ) {
    // Check if user already has a MAIN account
    const currentMain = user.vrchatAccounts.find(
      (acc) => acc.accountType === "MAIN",
    );

    if (currentMain && currentMain.vrcUserId !== vrcUserId) {
      // Set the current MAIN to ALT
      await prisma.vRChatAccount.update({
        where: { id: currentMain.id },
        data: { accountType: "ALT" },
      });
    }

    // Set this account as MAIN
    await prisma.vRChatAccount.update({
      where: { id: vrcAccount.id },
      data: { accountType: "MAIN" },
    });

    // Update whitelist after status change
    const discordId = interaction.user.id;
    try {
      await whitelistManager.syncAndPublishAfterVerification(discordId);
      
      // Send whitelist log for status change
      if (interaction.guild) {
        try {
          const roles = await getUserWhitelistRoles(discordId);
          await sendWhitelistLog(interaction.client, interaction.guild.id, {
            discordId,
            displayName: interaction.user.displayName || interaction.user.username,
            vrchatUsername: vrcAccount.vrchatUsername || undefined,
            vrcUserId: vrcUserId,
            roles,
            action: "modified",
            accountType: "MAIN",
          });
        } catch (logError) {
          loggers.bot.warn(
            `Failed to send whitelist log for ${discordId}`,
            logError,
          );
        }
      }
    } catch (error) {
      loggers.bot.error(
        `Failed to sync whitelist for ${discordId}`,
        error,
      );
    }

    await this.updateAccountManagerMessage(interaction);
  }

  private async handleSetAlt(
    interaction: ButtonInteraction,
    vrcAccount: VRChatAccount,
    vrcUserId: string,
  ) {
    // Set this account as ALT
    await prisma.vRChatAccount.update({
      where: { id: vrcAccount.id },
      data: { accountType: "ALT" },
    });

    // Update whitelist after status change
    const discordId = interaction.user.id;
    try {
      await whitelistManager.syncAndPublishAfterVerification(discordId);
      
      // Send whitelist log for status change
      if (interaction.guild) {
        try {
          const roles = await getUserWhitelistRoles(discordId);
          await sendWhitelistLog(interaction.client, interaction.guild.id, {
            discordId,
            displayName: interaction.user.displayName || interaction.user.username,
            vrchatUsername: vrcAccount.vrchatUsername || undefined,
            vrcUserId: vrcUserId,
            roles,
            action: "modified",
            accountType: "ALT",
          });
        } catch (logError) {
          loggers.bot.warn(
            `Failed to send whitelist log for ${discordId}`,
            logError,
          );
        }
      }
    } catch (error) {
      loggers.bot.error(
        `Failed to sync whitelist for ${discordId}`,
        error,
      );
    }

    await this.updateAccountManagerMessage(interaction);
  }

  private async handleDelete(
    interaction: ButtonInteraction,
    vrcAccount: VRChatAccount,
    vrcUserId: string,
  ) {
    try {
      // Try to unfriend the user from VRChat
      try {
        await unfriendUser(vrcUserId);
      } catch (unfriendError) {
        loggers.vrchat.warn(
          `Failed to unfriend VRChat user ${vrcUserId}`,
          unfriendError,
        );
        // Continue with deletion even if unfriending fails
      }

      // Delete the VRChat account from database
      await prisma.vRChatAccount.delete({
        where: { id: vrcAccount.id },
      });

      // Also delete any friend location consent records
      await prisma.friendLocationConsent.deleteMany({
        where: { ownerVrcUserId: vrcUserId },
      });

      // Get roles and account type before whitelist update for logging
      const discordId = interaction.user.id;
      let rolesBeforeDelete: string[] = [];
      const accountTypeBeforeDelete = vrcAccount.accountType;
      try {
        rolesBeforeDelete = await getUserWhitelistRoles(discordId);
      } catch (_error) {
        // Ignore errors when fetching roles before delete
      }

      // Update whitelist after account deletion
      try {
        await whitelistManager.syncAndPublishAfterVerification(discordId);
        
        // Send whitelist log - check if user still has roles after deletion
        if (interaction.guild) {
          try {
            const rolesAfterDelete = await getUserWhitelistRoles(discordId);
            const wasActuallyRemoved = rolesAfterDelete.length === 0 && rolesBeforeDelete.length > 0;
            
            // Only log if they actually lost whitelist access or still have it with different roles
            if (wasActuallyRemoved || rolesAfterDelete.length > 0) {
              await sendWhitelistLog(interaction.client, interaction.guild.id, {
                discordId,
                displayName: interaction.user.displayName || interaction.user.username,
                vrchatUsername: vrcAccount.vrchatUsername || undefined,
                vrcUserId: vrcUserId,
                roles: wasActuallyRemoved ? rolesBeforeDelete : rolesAfterDelete,
                action: wasActuallyRemoved ? "removed" : "modified",
                accountType: accountTypeBeforeDelete,
              });
            }
          } catch (logError) {
            console.warn(
              `[Account Manager] Failed to send whitelist log for ${discordId}:`,
              logError,
            );
          }
        }
      } catch (whitelistError) {
        loggers.bot.error(
          `Failed to sync whitelist after deletion for ${discordId}`,
          whitelistError,
        );
      }

      await this.updateAccountManagerMessage(interaction);
    } catch (error) {
      loggers.bot.error("Error deleting VRChat account", error);
      await interaction.reply({
        content:
          "❌ An error occurred while deleting the account. The account may have been partially removed.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  private async updateAccountManagerMessage(interaction: ButtonInteraction) {
    const discordId = interaction.user.id;

    // Get updated user data
    const user = await prisma.user.findUnique({
      where: { discordId },
      include: { vrchatAccounts: true },
    });

    if (!user || !user.vrchatAccounts || user.vrchatAccounts.length === 0) {
      // Create a simple container with just text for the completion message
      const emptyContainer = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "✅ All VRChat accounts have been unlinked.",
        ),
      );
      await interaction.update({
        components: [emptyContainer],
        flags: [MessageFlags.IsComponentsV2],
      });
      return;
    }

    // Filter to only verified accounts
    const verifiedAccounts = user.vrchatAccounts.filter(
      (acc) => acc.accountType === "MAIN" || acc.accountType === "ALT",
    );

    if (verifiedAccounts.length === 0) {
      // Create a simple container with just text for the completion message
      const emptyContainer = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "✅ All verified VRChat accounts have been unlinked.",
        ),
      );
      await interaction.update({
        components: [emptyContainer],
        flags: [MessageFlags.IsComponentsV2],
      });
      return;
    }

    // Rebuild the account manager interface
    const container = new ContainerBuilder();

    container.addSectionComponents(
      new SectionBuilder()
        .setButtonAccessory(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Info")
            .setEmoji({ name: "ℹ️" })
            .setDisabled(true)
            .setCustomId("accountmanager:info"),
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "**Account Manager**\n- You can set one account as MAIN and others as ALT. Only one MAIN is allowed.\n- Switching MAIN/ALT will update the status accordingly. Deleting an account will unfriend it.",
          ),
        ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true),
    );

    // Build a map of usernames for all verified accounts
    const usernames: Record<string, string> = {};
    for (const acc of verifiedAccounts) {
      try {
        const vrcUser = await getUserById(acc.vrcUserId);
        usernames[acc.vrcUserId] = vrcUser?.displayName || acc.vrcUserId;
      } catch {
        usernames[acc.vrcUserId] = acc.vrcUserId;
      }
    }

    for (const acc of verifiedAccounts) {
      const profileLink = `<https://vrchat.com/home/user/${acc.vrcUserId}>`;
      const displayName = usernames[acc.vrcUserId] || acc.vrcUserId;
      const consent = await prisma.friendLocationConsent.findFirst({
        where: { ownerVrcUserId: acc.vrcUserId },
      });
      const consentStatus = consent
        ? "Tracking: Enabled"
        : "Tracking: Disabled";
      const discordPing = `<@${discordId}>`;

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `[${displayName}](${profileLink}) - ${consentStatus} - Linked to ${discordPing}`,
        ),
      );

      const isMain = acc.accountType === "MAIN";
      const isAlt = acc.accountType === "ALT";

      // Button color/enable logic
      let mainBtnStyle = ButtonStyle.Primary;
      let mainBtnDisabled = false;
      let altBtnStyle = ButtonStyle.Secondary;
      let altBtnDisabled = false;

      if (isMain) {
        mainBtnStyle = ButtonStyle.Success; // Green
        mainBtnDisabled = true;
        altBtnStyle = ButtonStyle.Secondary; // Gray
        altBtnDisabled = false;
      } else if (isAlt) {
        mainBtnStyle = ButtonStyle.Secondary; // Gray
        mainBtnDisabled = false;
        altBtnStyle = ButtonStyle.Primary; // Blue
        altBtnDisabled = true;
      }

      container.addActionRowComponents(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setStyle(mainBtnStyle)
            .setLabel("Main")
            .setDisabled(mainBtnDisabled)
            .setCustomId(`accountmanager:main:${acc.vrcUserId}`),
          new ButtonBuilder()
            .setStyle(altBtnStyle)
            .setLabel("Alt")
            .setDisabled(altBtnDisabled)
            .setCustomId(`accountmanager:alt:${acc.vrcUserId}`),
          new ButtonBuilder()
            .setStyle(ButtonStyle.Danger)
            .setLabel("Unlink (Delete)")
            .setCustomId(`accountmanager:delete:${acc.vrcUserId}`),
        ),
      );
    }

    await interaction.update({
      components: [container],
    });
  }
}
