import { prisma, bot } from "../../main.js";
import {
  getGroupMember,
  addRoleToGroupMember,
  removeRoleFromGroupMember,
} from "../../utility/vrchat/groups.js";
import { GuildMember, EmbedBuilder, Colors, TextChannel } from "discord.js";

/**
 * Manager for syncing VRChat group roles to Discord roles
 */
export class GroupRoleSyncManager {
  /**
   * Get the highest management role order for a member in the VRChat group
   * Management roles have higher order values
   * @param groupId VRChat group ID
   * @param userId VRChat user ID
   * @returns The order of the highest management role, or -1 if none
   */
  private async getHighestManagementRoleOrder(
    groupId: string,
    userId: string,
  ): Promise<number> {
    try {
      const member = await getGroupMember(groupId, userId);
      if (!member) {
        console.log(
          `[GroupRoleSync] User ${userId} not found in group ${groupId}`,
        );
        return -1;
      }

      if (!member.mRoleIds || member.mRoleIds.length === 0) {
        console.log(`[GroupRoleSync] User ${userId} has no management roles`);
        return -1; // No management roles
      }

      console.log(
        `[GroupRoleSync] User ${userId} has ${member.mRoleIds.length} management role(s): ${member.mRoleIds.join(", ")}`,
      );

      // mRoleIds contains the management role IDs
      // We need to fetch role details to get order values
      // For now, we'll use a simple check: if they have any management roles, they cannot be edited
      // This is a safety measure - only members with NO management roles can be edited
      return member.mRoleIds.length > 0 ? 999 : -1;
    } catch (error) {
      console.error(
        `[GroupRoleSync] Error getting management roles for ${userId}:`,
        error,
      );
      return -1;
    }
  }

  /**
   * Get the highest management role order for the bot
   * @param groupId VRChat group ID
   * @returns The order of the bot's highest management role
   */
  private async getBotHighestManagementRoleOrder(
    groupId: string,
  ): Promise<number> {
    const botVrcUserId = "usr_c3c58aa6-c4dc-4de7-80a6-6826be9327ff";
    return this.getHighestManagementRoleOrder(groupId, botVrcUserId);
  }

  /**
   * Check if the bot can manage a member based on role hierarchy
   * @param groupId VRChat group ID
   * @param userId VRChat user ID to check
   * @returns True if the bot can manage this member
   */
  async canBotManageMember(
    groupId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      const botOrder = await this.getBotHighestManagementRoleOrder(groupId);
      const memberOrder = await this.getHighestManagementRoleOrder(
        groupId,
        userId,
      );

      console.log(
        `[GroupRoleSync] Permission check for ${userId} in group ${groupId}:`,
      );
      console.log(`  - Bot management role order: ${botOrder}`);
      console.log(`  - Member management role order: ${memberOrder}`);

      // If bot has no management roles, it cannot manage anyone
      if (botOrder === -1) {
        console.log(
          `[GroupRoleSync] ❌ Bot has no management permissions in group ${groupId}`,
        );
        return false;
      }

      // If member has any management roles, bot cannot manage them
      // This is a safety measure to prevent accidental changes to staff
      if (memberOrder !== -1) {
        console.log(
          `[GroupRoleSync] ❌ Member ${userId} has management roles and cannot be managed (safety measure)`,
        );
        return false;
      }

      console.log(
        `[GroupRoleSync] ✅ Bot can manage member ${userId} (no management roles)`,
      );
      return true;
    } catch (error) {
      console.error(
        `[GroupRoleSync] Error checking if bot can manage ${userId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Sync a user's Discord roles based on their VRChat group roles
   * @param guildId Discord guild ID
   * @param discordId Discord user ID
   * @param vrcUserId VRChat user ID
   */
  async syncUserRoles(
    guildId: string,
    discordId: string,
    vrcUserId: string,
  ): Promise<void> {
    try {
      console.log(
        `[GroupRoleSync] Starting role sync for user ${vrcUserId} (Discord: ${discordId}) in guild ${guildId}`,
      );

      // Get guild settings to find the VRChat group ID
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId },
      });

      if (!settings?.vrcGroupId) {
        console.log(
          `[GroupRoleSync] ❌ No VRChat group configured for guild ${guildId}`,
        );
        return;
      }

      const groupId = settings.vrcGroupId;
      console.log(`[GroupRoleSync] Using VRChat group: ${groupId}`);

      // Check if bot can manage this member
      const canManage = await this.canBotManageMember(groupId, vrcUserId);
      if (!canManage) {
        console.log(
          `[GroupRoleSync] ❌ Skipping role sync - bot cannot manage ${vrcUserId}`,
        );
        return;
      }

      // Get the member's VRChat group roles
      console.log(`[GroupRoleSync] Fetching group member info for ${vrcUserId}...`);
      const groupMember = await getGroupMember(groupId, vrcUserId);
      if (!groupMember) {
        console.log(
          `[GroupRoleSync] ❌ User ${vrcUserId} is not in group ${groupId}`,
        );
        return;
      }

      console.log(
        `[GroupRoleSync] Member has ${groupMember.roleIds?.length || 0} regular roles and ${groupMember.mRoleIds?.length || 0} management roles`,
      );

      // Get role mappings for this guild
      const roleMappings = await prisma.groupRoleMapping.findMany({
        where: {
          guildId,
          vrcGroupId: groupId,
        },
      });

      if (roleMappings.length === 0) {
        console.log(
          `[GroupRoleSync] ℹ️ No role mappings configured for guild ${guildId}`,
        );
        return;
      }

      console.log(
        `[GroupRoleSync] Found ${roleMappings.length} role mapping(s) for this guild`,
      );

      // Get Discord member
      const guild = await bot.guilds.fetch(guildId);
      if (!guild) {
        console.error(`[GroupRoleSync] ❌ Guild ${guildId} not found`);
        return;
      }

      const member = await guild.members.fetch(discordId);
      if (!member) {
        console.error(
          `[GroupRoleSync] ❌ Member ${discordId} not found in guild ${guildId}`,
        );
        return;
      }

      console.log(`[GroupRoleSync] Processing Discord member: ${member.displayName}`);

      // Get the VRChat role IDs the member has (including both member and management roles)
      const vrcRoleIds = new Set([
        ...(groupMember.roleIds || []),
        ...(groupMember.mRoleIds || []),
      ]);

      console.log(
        `[GroupRoleSync] Member has VRChat roles: ${Array.from(vrcRoleIds).join(", ")}`,
      );

      // Determine which Discord roles should be added and removed
      const rolesToAdd: string[] = [];
      const rolesToRemove: string[] = [];

      for (const mapping of roleMappings) {
        const hasVrcRole = vrcRoleIds.has(mapping.vrcGroupRoleId);
        const hasDiscordRole = member.roles.cache.has(mapping.discordRoleId);

        console.log(
          `[GroupRoleSync] Mapping check: VRC role ${mapping.vrcGroupRoleId} -> Discord role ${mapping.discordRoleId}`,
        );
        console.log(`  - Has VRC role: ${hasVrcRole}`);
        console.log(`  - Has Discord role: ${hasDiscordRole}`);

        if (hasVrcRole && !hasDiscordRole) {
          rolesToAdd.push(mapping.discordRoleId);
          console.log(`  ➡️ Will ADD Discord role ${mapping.discordRoleId}`);
        } else if (!hasVrcRole && hasDiscordRole) {
          rolesToRemove.push(mapping.discordRoleId);
          console.log(`  ⬅️ Will REMOVE Discord role ${mapping.discordRoleId}`);
        } else {
          console.log(`  ✓ Role already in sync`);
        }
      }

      // Apply role changes
      if (rolesToAdd.length > 0) {
        console.log(
          `[GroupRoleSync] Adding ${rolesToAdd.length} role(s) to ${member.displayName}:`,
          rolesToAdd,
        );
        await member.roles.add(rolesToAdd);
        console.log(`[GroupRoleSync] ✅ Successfully added roles`);
      }

      if (rolesToRemove.length > 0) {
        console.log(
          `[GroupRoleSync] Removing ${rolesToRemove.length} role(s) from ${member.displayName}:`,
          rolesToRemove,
        );
        await member.roles.remove(rolesToRemove);
        console.log(`[GroupRoleSync] ✅ Successfully removed roles`);
      }

      if (rolesToAdd.length === 0 && rolesToRemove.length === 0) {
        console.log(
          `[GroupRoleSync] ✓ No role changes needed for ${member.displayName}`,
        );
      }

      // Log the sync if there were changes
      if (rolesToAdd.length > 0 || rolesToRemove.length > 0) {
        await this.logRoleSync(
          guildId,
          member,
          rolesToAdd,
          rolesToRemove,
          "sync",
        );
      }

      console.log(
        `[GroupRoleSync] ✅ Completed role sync for ${member.displayName}`,
      );
    } catch (error) {
      console.error(
        `[GroupRoleSync] ❌ Error syncing roles for ${discordId}:`,
        error,
      );
      throw error; // Re-throw so the command can catch and display the error
    }
  }

  /**
   * Log a role sync action to the promotion logs channel
   */
  private async logRoleSync(
    guildId: string,
    member: GuildMember,
    rolesAdded: string[],
    rolesRemoved: string[],
    action: "sync" | "group-joined" | "group-member-updated",
  ): Promise<void> {
    try {
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId },
      });

      if (!settings?.botPromotionLogsChannelId) {
        return; // No log channel configured
      }

      const channel = (await bot.channels.fetch(
        settings.botPromotionLogsChannelId,
      )) as TextChannel;
      if (!channel || !channel.isTextBased()) {
        console.warn(
          `[GroupRoleSync] Invalid promotion logs channel ${settings.botPromotionLogsChannelId}`,
        );
        return;
      }

      const addedRoles =
        rolesAdded.length > 0
          ? rolesAdded.map((r) => `<@&${r}>`).join(", ")
          : "None";
      const removedRoles =
        rolesRemoved.length > 0
          ? rolesRemoved.map((r) => `<@&${r}>`).join(", ")
          : "None";

      let title = "🔄 VRChat Group Roles Synced";
      let color: number = Colors.Blue;

      if (action === "group-joined") {
        title = "✅ Member Joined VRChat Group";
        color = Colors.Green;
      } else if (action === "group-member-updated") {
        title = "🔄 VRChat Group Roles Updated";
        color = Colors.Gold;
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(
          `Discord roles have been synced for ${member.user.tag} based on their VRChat group roles.`,
        )
        .addFields(
          { name: "Member", value: `<@${member.id}>`, inline: true },
          {
            name: "Display Name",
            value: member.displayName || member.user.username,
            inline: true,
          },
          { name: "Roles Added", value: addedRoles, inline: false },
          { name: "Roles Removed", value: removedRoles, inline: false },
        )
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: "S.H.I.E.L.D. Bot - Group Role Sync" });

      await channel.send({ embeds: [embed] });
    } catch (error) {
      console.error("[GroupRoleSync] Error logging role sync:", error);
    }
  }

  /**
   * Handle a user joining the VRChat group
   */
  async handleGroupJoined(
    guildId: string,
    discordId: string,
    vrcUserId: string,
  ): Promise<void> {
    console.log(
      `[GroupRoleSync] User ${vrcUserId} joined group, syncing roles...`,
    );
    await this.syncUserRoles(guildId, discordId, vrcUserId);
  }

  /**
   * Handle a user's group roles being updated
   */
  async handleGroupMemberUpdated(
    guildId: string,
    discordId: string,
    vrcUserId: string,
  ): Promise<void> {
    console.log(
      `[GroupRoleSync] User ${vrcUserId} roles updated in group, syncing...`,
    );
    await this.syncUserRoles(guildId, discordId, vrcUserId);
  }

  /**
   * Handle a user leaving the VRChat group
   */
  async handleGroupLeft(
    guildId: string,
    discordId: string,
    vrcUserId: string,
  ): Promise<void> {
    try {
      console.log(`[GroupRoleSync] User ${vrcUserId} left group, logging...`);

      const settings = await prisma.guildSettings.findUnique({
        where: { guildId },
      });

      if (!settings?.botPromotionLogsChannelId) {
        return; // No log channel configured
      }

      const guild = await bot.guilds.fetch(guildId);
      if (!guild) {
        console.error(`[GroupRoleSync] Guild ${guildId} not found`);
        return;
      }

      const member = await guild.members.fetch(discordId).catch(() => null);
      const displayName = member?.displayName || discordId;

      const channel = (await bot.channels.fetch(
        settings.botPromotionLogsChannelId,
      )) as TextChannel;
      if (!channel || !channel.isTextBased()) {
        console.warn(
          `[GroupRoleSync] Invalid promotion logs channel ${settings.botPromotionLogsChannelId}`,
        );
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("⬅️ Member Left VRChat Group")
        .setDescription(
          `${displayName} has left the VRChat group. Their Discord roles remain unchanged.`,
        )
        .addFields(
          { name: "Member", value: `<@${discordId}>`, inline: true },
          { name: "Display Name", value: displayName, inline: true },
        )
        .setColor(Colors.Orange)
        .setTimestamp()
        .setFooter({ text: "S.H.I.E.L.D. Bot - Group Role Sync" });

      await channel.send({ embeds: [embed] });
    } catch (error) {
      console.error("[GroupRoleSync] Error handling group left:", error);
    }
  }
}

export const groupRoleSyncManager = new GroupRoleSyncManager();
