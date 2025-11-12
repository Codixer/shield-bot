import { prisma, bot } from "../../main.js";
import {
  getGroupMember,
  addRoleToGroupMember,
  removeRoleFromGroupMember,
  getGroupRoles,
} from "../../utility/vrchat/groups.js";
import { GuildMember, EmbedBuilder, Colors, TextChannel } from "discord.js";

/**
 * Manager for syncing VRChat group roles to Discord roles
 */
export class GroupRoleSyncManager {
  // Cache for group roles to avoid repeated API calls
  private roleCache: Map<string, any[]> = new Map();

  /**
   * Get all roles for a group (with caching)
   * @param groupId VRChat group ID
   * @returns Array of role objects with id, name, order, etc.
   */
  private async getGroupRolesWithCache(groupId: string): Promise<any[]> {
    if (this.roleCache.has(groupId)) {
      return this.roleCache.get(groupId)!;
    }

    const roles = await getGroupRoles(groupId);
    this.roleCache.set(groupId, roles);

    // Clear cache after 5 minutes
    setTimeout(() => {
      this.roleCache.delete(groupId);
    }, 5 * 60 * 1000);

    return roles;
  }

  /**
   * Get the highest role order for a member in the VRChat group
   * Higher order values = higher rank in the hierarchy
   * @param groupId VRChat group ID
   * @param userId VRChat user ID
   * @param managementOnly If true, only check management roles
   * @returns The highest order value, or -1 if none
   */
  private async getHighestRoleOrder(
    groupId: string,
    userId: string,
    managementOnly: boolean = false,
  ): Promise<number> {
    try {
      const member = await getGroupMember(groupId, userId);
      if (!member) {
        console.log(
          `[GroupRoleSync] User ${userId} not found in group ${groupId}`,
        );
        return -1;
      }

      // Get the role IDs to check
      const roleIdsToCheck = managementOnly
        ? member.mRoleIds || []
        : [...(member.roleIds || []), ...(member.mRoleIds || [])];

      if (roleIdsToCheck.length === 0) {
        console.log(
          `[GroupRoleSync] User ${userId} has no ${managementOnly ? "management " : ""}roles`,
        );
        return -1;
      }

      console.log(
        `[GroupRoleSync] User ${userId} has ${roleIdsToCheck.length} ${managementOnly ? "management " : ""}role(s): ${roleIdsToCheck.join(", ")}`,
      );

      // Fetch all group roles to get their order values
      const allRoles = await this.getGroupRolesWithCache(groupId);
      const roleOrderMap = new Map(
        allRoles.map((role: any) => [role.id, role.order]),
      );

      // Find the highest order among the member's roles
      let highestOrder = -1;
      for (const roleId of roleIdsToCheck) {
        const order = roleOrderMap.get(roleId);
        if (order !== undefined && order > highestOrder) {
          highestOrder = order;
          console.log(
            `[GroupRoleSync] Role ${roleId} has order ${order} (current highest)`,
          );
        }
      }

      console.log(
        `[GroupRoleSync] Highest ${managementOnly ? "management " : ""}role order for ${userId}: ${highestOrder}`,
      );
      return highestOrder;
    } catch (error) {
      console.error(
        `[GroupRoleSync] Error getting role order for ${userId}:`,
        error,
      );
      return -1;
    }
  }

  /**
   * Get the highest management role order for a member in the VRChat group
   * @param groupId VRChat group ID
   * @param userId VRChat user ID
   * @returns The order of the highest management role, or -1 if none
   */
  private async getHighestManagementRoleOrder(
    groupId: string,
    userId: string,
  ): Promise<number> {
    return this.getHighestRoleOrder(groupId, userId, true);
  }

  /**
   * Check if the bot can manage a member based on role hierarchy
   * Bot can manage members if:
   * 1. Bot is in the group
   * 2. Member has no management roles OR bot's highest role > member's highest management role
   * @param groupId VRChat group ID
   * @param userId VRChat user ID to check
   * @returns True if the bot can manage this member
   */
  async canBotManageMember(
    groupId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      const botVrcUserId = "usr_c3c58aa6-c4dc-4de7-80a6-6826be9327ff";

      // Check if bot is in the group and get its highest role order (any role, not just management)
      const botHighestOrder = await this.getHighestRoleOrder(
        groupId,
        botVrcUserId,
        false,
      );
      if (botHighestOrder === -1) {
        console.log(
          `[GroupRoleSync] ❌ Bot is not a member of group ${groupId}`,
        );
        return false;
      }

      // Get the member's highest management role order
      const memberManagementOrder = await this.getHighestManagementRoleOrder(
        groupId,
        userId,
      );

      console.log(
        `[GroupRoleSync] Permission check for ${userId} in group ${groupId}:`,
      );
      console.log(`  - Bot's highest role order: ${botHighestOrder}`);
      console.log(
        `  - Member's highest management role order: ${memberManagementOrder}`,
      );

      // If member has no management roles, bot can manage them
      if (memberManagementOrder === -1) {
        console.log(
          `[GroupRoleSync] ✅ Bot can manage member ${userId} (member has no management roles)`,
        );
        return true;
      }

      // If member has management roles, check if bot's role is higher
      if (botHighestOrder > memberManagementOrder) {
        console.log(
          `[GroupRoleSync] ✅ Bot can manage member ${userId} (bot role order ${botHighestOrder} > member management order ${memberManagementOrder})`,
        );
        return true;
      }

      console.log(
        `[GroupRoleSync] ❌ Bot cannot manage member ${userId} (member has management roles with equal or higher order)`,
      );
      return false;
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
