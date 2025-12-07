import { Discord, Guard, Slash, SlashGroup } from "discordx";
import {
  CommandInteraction,
  EmbedBuilder,
  Colors,
  MessageFlags,
} from "discord.js";
import { BotOwnerGuard, VRChatLoginGuard, GuildGuard } from "../../../utility/guards.js";
import { prisma } from "../../../main.js";
import { inviteUserToGroup } from "../../../utility/vrchat/groups.js";
import { getUserById } from "../../../utility/vrchat/user.js";
import { vrchatApi } from "../../../utility/vrchat/index.js";
import { loggers } from "../../../utility/logger.js";

@Discord()
@SlashGroup({
  name: "group",
  description: "VRChat group settings",
  root: "settings",
})
@SlashGroup("group", "settings")
@Guard(BotOwnerGuard, VRChatLoginGuard, GuildGuard)
export class GroupInviteAllCommand {
  @Slash({
    name: "invite-all",
    description: "Invite all verified users in the database (who are still friended) to the VRChat group",
  })
  async inviteAll(interaction: CommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (!interaction.guildId) {
        await interaction.editReply({
          content: "❌ This command can only be used in a server.",
        });
        return;
      }

      // Get the VRChat group ID from guild settings
      const guildSettings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
      });

      if (!guildSettings?.vrcGroupId) {
        await interaction.editReply({
          content: "❌ No VRChat group ID is configured for this server. Please set it using `/settings group set-group-id`.",
        });
        return;
      }

      const groupId = guildSettings.vrcGroupId;

      // Send initial status
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("⏳ Starting Bulk Group Invite")
            .setDescription("Fetching users from database...")
            .setColor(Colors.Blue)
            .setFooter({ text: "S.H.I.E.L.D. Bot - Group Management" })
            .setTimestamp(),
        ],
      });

      // Query all verified VRChat accounts from database
      const vrchatAccounts = await prisma.vRChatAccount.findMany({
        where: {
          accountType: { in: ["MAIN", "ALT"] },
        },
        include: {
          user: true,
        },
      });

      if (vrchatAccounts.length === 0) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("ℹ️ No Users Found")
              .setDescription("No verified VRChat accounts found in the database.")
              .setColor(Colors.Blue)
              .setFooter({ text: "S.H.I.E.L.D. Bot - Group Management" })
              .setTimestamp(),
          ],
        });
        return;
      }

      // Get unique VRChat user IDs (in case of duplicates)
      const uniqueVrcUserIds = Array.from(
        new Set(vrchatAccounts.map((acc) => acc.vrcUserId)),
      );

      loggers.bot.info(
        `[Bulk Group Invite] Found ${uniqueVrcUserIds.length} unique verified VRChat accounts`,
      );

      // Update status
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("⏳ Checking Friend Status")
            .setDescription(
              `Found ${uniqueVrcUserIds.length} verified accounts. Checking which users are still friended...`,
            )
            .setColor(Colors.Blue)
            .setFooter({ text: "S.H.I.E.L.D. Bot - Group Management" })
            .setTimestamp(),
        ],
      });

      // Check which users are still friended
      const friendedUserIds = await this.getFriendedUserIds(uniqueVrcUserIds);

      if (friendedUserIds.size === 0) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("ℹ️ No Friended Users")
              .setDescription(
                "No users in the database are currently friended on VRChat.",
              )
              .setColor(Colors.Blue)
              .setFooter({ text: "S.H.I.E.L.D. Bot - Group Management" })
              .setTimestamp(),
          ],
        });
        return;
      }

      loggers.bot.info(
        `[Bulk Group Invite] Found ${friendedUserIds.size} friended users out of ${uniqueVrcUserIds.length} total`,
      );

      // Update status
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("⏳ Sending Invitations")
            .setDescription(
              `Sending group invitations to ${friendedUserIds.size} friended users...`,
            )
            .setColor(Colors.Blue)
            .setFooter({ text: "S.H.I.E.L.D. Bot - Group Management" })
            .setTimestamp(),
        ],
      });

      // Invite all friended users
      const stats = await this.inviteUsersToGroup(
        groupId,
        Array.from(friendedUserIds),
      );

      // Create summary embed
      const summaryEmbed = new EmbedBuilder()
        .setTitle("✅ Bulk Group Invite Complete")
        .setDescription(
          `Finished inviting users to group \`${groupId}\`.`,
        )
        .addFields(
          {
            name: "📊 Statistics",
            value: [
              `**Total users in database:** ${uniqueVrcUserIds.length}`,
              `**Users still friended:** ${friendedUserIds.size}`,
              `**Successful invites:** ${stats.successful}`,
              `**Already members:** ${stats.alreadyMember}`,
              `**Errors:** ${stats.errors}`,
            ].join("\n"),
            inline: false,
          },
        )
        .setColor(
          stats.errors > 0
            ? Colors.Orange
            : stats.successful > 0
              ? Colors.Green
              : Colors.Blue,
        )
        .setFooter({ text: "S.H.I.E.L.D. Bot - Group Management" })
        .setTimestamp();

      if (stats.errorDetails.length > 0) {
        const errorList = stats.errorDetails
          .slice(0, 10)
          .map((err) => `• ${err}`)
          .join("\n");
        const errorText =
          stats.errorDetails.length > 10
            ? `${errorList}\n... and ${stats.errorDetails.length - 10} more`
            : errorList;
        summaryEmbed.addFields({
          name: "⚠️ Error Details",
          value: errorText.length > 1024 ? `${errorText.substring(0, 1020)}...` : errorText,
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [summaryEmbed] });
    } catch (error: unknown) {
      loggers.bot.error("[Bulk Group Invite] Error", error);
      await interaction.editReply({
        content: `❌ Failed to process bulk group invite: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  /**
   * Get a Set of user IDs that are still friended on VRChat
   * Uses listFriends API to get all friends, falls back to individual checks if needed
   */
  private async getFriendedUserIds(
    vrcUserIds: string[],
  ): Promise<Set<string>> {
    const friendedIds = new Set<string>();

    // Try to get friends list using listFriends API
    try {
      // Get all friends using pagination (max 100 per request)
      const allFriends: Array<{ id: string }> = [];
      let offset = 0;
      const batchSize = 100;
      let hasMore = true;

      while (hasMore) {
        const friends = await vrchatApi.friendApi.listFriends({
          n: batchSize,
          offset,
        });

        if (friends.length === 0) {
          hasMore = false;
        } else {
          allFriends.push(...friends);
          offset += batchSize;

          // If we got fewer than batchSize, we've reached the end
          if (friends.length < batchSize) {
            hasMore = false;
          }
        }
      }

      // Create a Set of friend IDs
      const friendIds = new Set<string>();
      for (const friend of allFriends) {
        if (friend?.id) {
          friendIds.add(friend.id);
        }
      }

      // Filter to only include users in our database
      for (const userId of vrcUserIds) {
        if (friendIds.has(userId)) {
          friendedIds.add(userId);
        }
      }

      loggers.bot.info(
        `[Bulk Group Invite] Found ${friendedIds.size} friended users using listFriends API (total friends: ${allFriends.length})`,
      );
      return friendedIds;
    } catch (error) {
      loggers.bot.warn(
        "[Bulk Group Invite] listFriends API failed, falling back to individual checks",
        error,
      );
    }

    // Fallback: Check each user individually
    loggers.bot.info(
      `[Bulk Group Invite] Checking friend status for ${vrcUserIds.length} users individually...`,
    );

    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < vrcUserIds.length; i += batchSize) {
      const batch = vrcUserIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (userId) => {
        try {
          const user = await getUserById(userId);
          if (user?.isFriend) {
            return userId;
          }
          return null;
        } catch (error) {
          loggers.bot.warn(
            `[Bulk Group Invite] Failed to check friend status for ${userId}:`,
            error,
          );
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      for (const result of batchResults) {
        if (result) {
          friendedIds.add(result);
        }
      }

      // Add a small delay between batches to avoid rate limits
      if (i + batchSize < vrcUserIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    loggers.bot.info(
      `[Bulk Group Invite] Found ${friendedIds.size} friended users using individual checks`,
    );
    return friendedIds;
  }

  /**
   * Invite users to the group and return statistics
   */
  private async inviteUsersToGroup(
    groupId: string,
    userIds: string[],
  ): Promise<{
    successful: number;
    alreadyMember: number;
    errors: number;
    errorDetails: string[];
  }> {
    const stats = {
      successful: 0,
      alreadyMember: 0,
      errors: 0,
      errorDetails: [] as string[],
    };

    // Process in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (userId) => {
        try {
          const result = await inviteUserToGroup(groupId, userId);

          // Check if user is already a member
          if (
            result &&
            typeof result === "object" &&
            "alreadyMember" in result &&
            result.alreadyMember
          ) {
            stats.alreadyMember++;
            return { success: true, alreadyMember: true };
          }

          stats.successful++;
          return { success: true, alreadyMember: false };
        } catch (error) {
          stats.errors++;
          const errorMsg = error instanceof Error ? error.message : String(error);
          stats.errorDetails.push(`${userId}: ${errorMsg}`);
          loggers.bot.warn(
            `[Bulk Group Invite] Failed to invite ${userId} to group:`,
            error,
          );
          return { success: false, alreadyMember: false };
        }
      });

      await Promise.all(batchPromises);

      // Add a small delay between batches to avoid rate limits
      if (i + batchSize < userIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return stats;
  }
}

