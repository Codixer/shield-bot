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
   * IMPORTANT: In VRChat groups, LOWER order values = HIGHER rank
   * (e.g., order 0 is highest, order 100 is lowest)
   * @param groupId VRChat group ID
   * @param userId VRChat user ID
   * @param managementOnly If true, only check management roles
   * @returns The lowest order value (highest rank), or Infinity if none
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
        return Infinity; // No roles = lowest possible rank
      }

      // Get the role IDs to check
      const roleIdsToCheck = managementOnly
        ? member.mRoleIds || []
        : [...(member.roleIds || []), ...(member.mRoleIds || [])];

      if (roleIdsToCheck.length === 0) {
        console.log(
          `[GroupRoleSync] User ${userId} has no ${managementOnly ? "management " : ""}roles`,
        );
        return Infinity; // No roles = lowest possible rank
      }

      console.log(
        `[GroupRoleSync] User ${userId} has ${roleIdsToCheck.length} ${managementOnly ? "management " : ""}role(s): ${roleIdsToCheck.join(", ")}`,
      );

      // Fetch all group roles to get their order values
      const allRoles = await this.getGroupRolesWithCache(groupId);
      const roleOrderMap = new Map(
        allRoles.map((role: any) => [role.id, role.order]),
      );

      // Find the LOWEST order (highest rank) among the member's roles
      let highestRankOrder = Infinity;
      for (const roleId of roleIdsToCheck) {
        const order = roleOrderMap.get(roleId);
        if (order !== undefined && order < highestRankOrder) {
          highestRankOrder = order;
          console.log(
            `[GroupRoleSync] Role ${roleId} has order ${order} (current highest rank)`,
          );
        }
      }

      console.log(
        `[GroupRoleSync] Highest ${managementOnly ? "management " : ""}role rank for ${userId}: order ${highestRankOrder}`,
      );
      return highestRankOrder;
    } catch (error) {
      console.error(
        `[GroupRoleSync] Error getting role order for ${userId}:`,
        error,
      );
      return Infinity;
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
   * 2. Member's highest role (any role) has a HIGHER order value than bot's highest role
   * 
   * IMPORTANT: In VRChat, LOWER order = HIGHER rank (order 0 is top, order 100 is bottom)
   * So bot can manage if: bot's order < member's order (bot is higher rank)
   * 
   * This prevents the bot from managing members who have roles above it in the hierarchy,
   * even if those roles aren't management roles (e.g., Staff role above Bot role)
   * 
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

      // Get bot's highest role order (lowest number = highest rank)
      const botHighestRankOrder = await this.getHighestRoleOrder(
        groupId,
        botVrcUserId,
        false,
      );
      if (botHighestRankOrder === Infinity) {
        console.log(
          `[GroupRoleSync] ❌ Bot is not a member of group ${groupId}`,
        );
        return false;
      }

      // Get the member's highest role order (lowest number = highest rank)
      const memberHighestRankOrder = await this.getHighestRoleOrder(
        groupId,
        userId,
        false, // Check ALL roles, not just management
      );

      console.log(
        `[GroupRoleSync] Permission check for ${userId} in group ${groupId}:`,
      );
      console.log(`  - Bot's highest rank (order): ${botHighestRankOrder}`);
      console.log(
        `  - Member's highest rank (order): ${memberHighestRankOrder}`,
      );

      // If member has no roles, bot can manage them
      if (memberHighestRankOrder === Infinity) {
        console.log(
          `[GroupRoleSync] ✅ Bot can manage member ${userId} (member has no roles)`,
        );
        return true;
      }

      // Bot can manage if its order is LOWER (higher rank) than member's order
      // Example: Bot order 10, Member order 50 → Bot can manage (10 < 50)
      if (botHighestRankOrder < memberHighestRankOrder) {
        console.log(
          `[GroupRoleSync] ✅ Bot can manage member ${userId} (bot order ${botHighestRankOrder} < member order ${memberHighestRankOrder})`,
        );
        return true;
      }

      console.log(
        `[GroupRoleSync] ❌ Bot cannot manage member ${userId} (member has roles with equal or higher rank: order ${memberHighestRankOrder} <= ${botHighestRankOrder})`,
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
   * Sync a user's VRChat group roles based on their Discord roles
   * This assigns/removes VRChat group roles to match their Discord roles
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

      // Get the member's current VRChat group roles
      console.log(
        `[GroupRoleSync] Fetching group member info for ${vrcUserId}...`,
      );
      const groupMember = await getGroupMember(groupId, vrcUserId);
      if (!groupMember) {
        console.log(
          `[GroupRoleSync] ❌ User ${vrcUserId} is not in group ${groupId}`,
        );
        return;
      }

      console.log(
        `[GroupRoleSync] Member has ${groupMember.roleIds?.length || 0} regular roles and ${groupMember.mRoleIds?.length || 0} management roles in VRChat`,
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

      // Get Discord member to check their roles
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

      console.log(
        `[GroupRoleSync] Processing Discord member: ${member.displayName}`,
      );

      // Get the VRChat role IDs the member currently has (non-management only)
      const currentVrcRoleIds = new Set(groupMember.roleIds || []);

      console.log(
        `[GroupRoleSync] Member has VRChat roles: ${Array.from(currentVrcRoleIds).join(", ") || "none"}`,
      );

      // Determine which VRChat roles should be added and removed based on Discord roles
      const vrcRolesToAdd: string[] = [];
      const vrcRolesToRemove: string[] = [];

      for (const mapping of roleMappings) {
        const hasDiscordRole = member.roles.cache.has(mapping.discordRoleId);
        const hasVrcRole = currentVrcRoleIds.has(mapping.vrcGroupRoleId);

        console.log(
          `[GroupRoleSync] Mapping check: Discord role ${mapping.discordRoleId} -> VRC role ${mapping.vrcGroupRoleId}`,
        );
        console.log(`  - Has Discord role: ${hasDiscordRole}`);
        console.log(`  - Has VRChat role: ${hasVrcRole}`);

        if (hasDiscordRole && !hasVrcRole) {
          vrcRolesToAdd.push(mapping.vrcGroupRoleId);
          console.log(
            `  ➡️ Will ADD VRChat role ${mapping.vrcGroupRoleId} (has Discord role)`,
          );
        } else if (!hasDiscordRole && hasVrcRole) {
          vrcRolesToRemove.push(mapping.vrcGroupRoleId);
          console.log(
            `  ⬅️ Will REMOVE VRChat role ${mapping.vrcGroupRoleId} (missing Discord role)`,
          );
        } else {
          console.log(`  ✓ VRChat role already in sync`);
        }
      }

      // Apply VRChat role changes
      if (vrcRolesToAdd.length > 0) {
        console.log(
          `[GroupRoleSync] Adding ${vrcRolesToAdd.length} VRChat role(s) to ${member.displayName}:`,
          vrcRolesToAdd,
        );
        for (const roleId of vrcRolesToAdd) {
          try {
            await addRoleToGroupMember(groupId, vrcUserId, roleId);
            console.log(`[GroupRoleSync] ✅ Added VRChat role ${roleId}`);
          } catch (error: any) {
            console.error(
              `[GroupRoleSync] ❌ Failed to add VRChat role ${roleId}:`,
              error.message,
            );
          }
        }
      }

      if (vrcRolesToRemove.length > 0) {
        console.log(
          `[GroupRoleSync] Removing ${vrcRolesToRemove.length} VRChat role(s) from ${member.displayName}:`,
          vrcRolesToRemove,
        );
        for (const roleId of vrcRolesToRemove) {
          try {
            await removeRoleFromGroupMember(groupId, vrcUserId, roleId);
            console.log(`[GroupRoleSync] ✅ Removed VRChat role ${roleId}`);
          } catch (error: any) {
            console.error(
              `[GroupRoleSync] ❌ Failed to remove VRChat role ${roleId}:`,
              error.message,
            );
          }
        }
      }

      if (vrcRolesToAdd.length === 0 && vrcRolesToRemove.length === 0) {
        console.log(
          `[GroupRoleSync] ✓ No VRChat role changes needed for ${member.displayName}`,
        );
      }

      // Log the sync if there were changes
      if (vrcRolesToAdd.length > 0 || vrcRolesToRemove.length > 0) {
        await this.logRoleSync(
          guildId,
          member,
          vrcRolesToAdd,
          vrcRolesToRemove,
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
    vrcRolesAdded: string[],
    vrcRolesRemoved: string[],
    action: "sync" | "group-joined" | "discord-role-updated",
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

      // Format VRChat role IDs
      const addedRoles =
        vrcRolesAdded.length > 0
          ? vrcRolesAdded.map((r) => `\`${r}\``).join(", ")
          : "None";
      const removedRoles =
        vrcRolesRemoved.length > 0
          ? vrcRolesRemoved.map((r) => `\`${r}\``).join(", ")
          : "None";

      let title = "🔄 VRChat Group Roles Synced";
      let color: number = Colors.Blue;
      let description = `VRChat group roles have been synced for ${member.user.tag} based on their Discord roles.`;

      if (action === "group-joined") {
        title = "✅ Member Joined VRChat Group";
        color = Colors.Green;
        description = `${member.user.tag} joined the VRChat group. Their VRChat roles have been assigned based on their Discord roles.`;
      } else if (action === "discord-role-updated") {
        title = "🔄 Discord Roles Changed";
        color = Colors.Gold;
        description = `${member.user.tag}'s Discord roles changed. Their VRChat group roles have been updated to match.`;
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .addFields(
          { name: "Member", value: `<@${member.id}>`, inline: true },
          {
            name: "Display Name",
            value: member.displayName || member.user.username,
            inline: true,
          },
          {
            name: "VRChat Roles Added",
            value: addedRoles,
            inline: false,
          },
          {
            name: "VRChat Roles Removed",
            value: removedRoles,
            inline: false,
          },
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
   * Assigns VRChat group roles based on their Discord roles
   */
  async handleGroupJoined(
    guildId: string,
    discordId: string,
    vrcUserId: string,
  ): Promise<void> {
    console.log(
      `[GroupRoleSync] User ${vrcUserId} joined group, assigning VRChat roles based on Discord...`,
    );
    await this.syncUserRoles(guildId, discordId, vrcUserId);
  }

  /**
   * Handle Discord role updates for a verified user
   * Updates their VRChat group roles to match
   */
  async handleDiscordRoleUpdate(
    guildId: string,
    discordId: string,
    vrcUserId: string,
  ): Promise<void> {
    console.log(
      `[GroupRoleSync] Discord roles updated for ${discordId}, syncing VRChat roles...`,
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
          `${displayName} has left the VRChat group.`,
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
