import { Discord, On, ArgsOf } from "discordx";
import { WhitelistManager } from "../../../managers/whitelist/whitelistManager.js";
import { prisma } from "../../../main.js";
import { sendWhitelistLog } from "../../../utility/vrchat/whitelistLogger.js";

const whitelistManager = new WhitelistManager();

@Discord()
export class WhitelistRoleSync {
  // Build a human commit message using permissions list
  private buildCommitMessage(
    username: string,
    action: "added" | "removed" | "granted",
    permissions: Set<string>,
  ): string {
    const list = permissions.size
      ? Array.from(permissions).sort().join(", ")
      : "none";
    return `${username} was ${action} with the roles ${list}`;
  }

  // Resolve expected whitelist roles and permissions based on Discord roles
  private async getExpectedFromDiscordRoles(
    discordRoleIds: string[],
  ): Promise<{ roles: string[]; permissions: Set<string> }> {
    const roles: string[] = [];
    const permissions = new Set<string>();
    const roleMappings = await whitelistManager.getDiscordRoleMappings();
    for (const mapping of roleMappings) {
      if (!mapping.discordRoleId) continue;
      if (discordRoleIds.includes(mapping.discordRoleId)) {
        // Note: name field was removed, using discordRoleId as identifier
        roles.push(mapping.discordRoleId);
        const perms = mapping.permissions as string | null | undefined;
        if (perms)
          for (const p of perms
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean))
            permissions.add(p);
      }
    }
    return { roles, permissions };
  }

  @On({ event: "guildMemberUpdate" })
  async onGuildMemberUpdate([
    oldMember,
    newMember,
  ]: ArgsOf<"guildMemberUpdate">): Promise<void> {
    try {
      console.log(
        `[Whitelist] Syncing roles for ${newMember.displayName} (${newMember.id})`,
      );

      // Fetch full member data if oldMember is partial
      let fullOldMember = oldMember;
      if (oldMember.partial) {
        try {
          fullOldMember = await oldMember.fetch();
        } catch (error) {
          console.warn(
            `[Whitelist] Could not fetch full member data for ${oldMember.id}, using available data`,
          );
          fullOldMember = oldMember;
        }
      }

      // Only process if roles changed
      const oldRoleIds =
        fullOldMember.roles?.cache?.map((role: any) => role.id) || [];
      const newRoleIds =
        newMember.roles?.cache?.map((role: any) => role.id) || [];

      console.log(
        `[Whitelist] Role comparison for ${newMember.displayName}: old=${oldRoleIds.length}, new=${newRoleIds.length}`,
      );

      if (
        JSON.stringify(oldRoleIds.sort()) === JSON.stringify(newRoleIds.sort())
      ) {
        console.log(
          `[Whitelist] No role changes detected for ${newMember.displayName}`,
        );
        return; // No role changes
      }

      // Check if user has any VRChat accounts (verified or unverified)
      const userHasVRChatAccount = await this.hasVRChatAccount(newMember.id);
      if (!userHasVRChatAccount) {
        console.log(
          `[Whitelist] User ${newMember.displayName} has no VRChat account, skipping whitelist sync`,
        );
        return;
      }

      // Get current and expected state
      const currentUser = await whitelistManager.getUserByDiscordId(
        newMember.id,
      );
      // Get current role assignments by Discord role ID for comparison
      const currentWhitelistRoles =
        currentUser?.whitelistEntry?.roleAssignments?.map(
          (a: any) => a.role.discordRoleId || a.role.id,
        ) || [];
      const {
        roles: expectedWhitelistRoles,
        permissions: expectedPermissions,
      } = await this.getExpectedFromDiscordRoles(newRoleIds);

      // Compare current whitelist roles with expected roles using sets
      const currentRolesSorted = [...currentWhitelistRoles].sort();
      const expectedRolesSorted = [...expectedWhitelistRoles].sort();

      if (
        JSON.stringify(currentRolesSorted) ===
        JSON.stringify(expectedRolesSorted)
      ) {
        console.log(
          `[Whitelist] No whitelist role changes needed for ${newMember.displayName} - Current: [${currentRolesSorted.join(", ")}], Expected: [${expectedRolesSorted.join(", ")}]`,
        );
        return; // No whitelist changes needed
      }

      console.log(
        `[Whitelist] Whitelist role changes detected for ${newMember.displayName} - Current: [${currentRolesSorted.join(", ")}], Expected: [${expectedRolesSorted.join(", ")}]`,
      );

      // Sync user roles (this handles both granting and removing access based on current roles)
      await whitelistManager.syncUserRolesFromDiscord(
        newMember.id,
        newRoleIds,
        newMember.guild.id,
      );

      // Get updated whitelist roles after sync
      const updatedWhitelistRoles =
        await this.getUserWhitelistRoles(newMember.id);

      console.log(
        `[Whitelist] Successfully updated whitelist for ${newMember.displayName}`,
      );

      // Send whitelist log message
      try {
        const vrchatInfo = await whitelistManager.getUserByDiscordId(
          newMember.id,
        );
        const primaryAccount = vrchatInfo?.vrchatAccounts?.[0];
        await sendWhitelistLog(newMember.client, newMember.guild.id, {
          discordId: newMember.id,
          displayName: newMember.displayName || newMember.user?.username || newMember.id,
          vrchatUsername: primaryAccount?.vrchatUsername || undefined,
          vrcUserId: primaryAccount?.vrcUserId,
          roles: updatedWhitelistRoles,
          action: updatedWhitelistRoles.length === 0 ? "removed" : "modified",
          accountType: primaryAccount?.accountType,
        });
      } catch (logError) {
        console.warn(
          `[Whitelist] Failed to send modification log for ${newMember.displayName}:`,
          logError,
        );
      }

      // Publish whitelist with contextual commit message after role changes (use permissions, not Discord roles)
      try {
        const action: "added" | "removed" | "granted" =
          expectedRolesSorted.length === 0
            ? "removed"
            : currentRolesSorted.length === 0
              ? "added"
              : "granted";
        const username =
          newMember.displayName || newMember.user?.username || newMember.id;
        // Use expected permissions for commit message (if removed, show none)
        const permsForMsg =
          action === "removed" ? new Set<string>() : expectedPermissions;
        
        // Queue for batched update instead of immediate publish
        const msg = this.buildCommitMessage(username, action, permsForMsg);
        whitelistManager.queueBatchedUpdate(newMember.id, msg);
        console.log(
          `[Whitelist] Queued GitHub repository update after role change for ${newMember.displayName}`,
        );
      } catch (repoError) {
        console.warn(
          `[Whitelist] Failed to queue GitHub repository update after role change for ${newMember.displayName}:`,
          repoError,
        );
      }
    } catch (error) {
      console.error(
        `[Whitelist] Error syncing roles for ${newMember.displayName}:`,
        error,
      );
    }
  }

  @On({ event: "guildMemberAdd" })
  async onGuildMemberAdd([member]: ArgsOf<"guildMemberAdd">): Promise<void> {
    try {
      const roleIds = member.roles.cache.map((role: any) => role.id);

      console.log(
        `[Whitelist] New member ${member.displayName} joined with ${roleIds.length} roles`,
      );

      // Check if user has any VRChat accounts (verified or unverified)
      const userHasVRChatAccount = await this.hasVRChatAccount(member.id);
      if (!userHasVRChatAccount) {
        console.log(
          `[Whitelist] New member ${member.displayName} has no VRChat account, skipping whitelist sync`,
        );
        return;
      }

      // Sync their roles (this will grant access if they have qualifying roles)
      await whitelistManager.syncUserRolesFromDiscord(
        member.id,
        roleIds,
        member.guild.id,
      );

      // Get updated whitelist roles after sync
      const updatedWhitelistRoles = await this.getUserWhitelistRoles(member.id);

      console.log(
        `[Whitelist] Successfully processed new member ${member.displayName}`,
      );

      // Send whitelist log message if they got whitelist access
      if (updatedWhitelistRoles.length > 0) {
        try {
          const vrchatInfo = await whitelistManager.getUserByDiscordId(
            member.id,
          );
          const primaryAccount = vrchatInfo?.vrchatAccounts?.[0];
          await sendWhitelistLog(member.client, member.guild.id, {
            discordId: member.id,
            displayName: member.displayName || member.user?.username || member.id,
            vrchatUsername: primaryAccount?.vrchatUsername || undefined,
            vrcUserId: primaryAccount?.vrcUserId,
            roles: updatedWhitelistRoles,
            action: "verified",
            accountType: primaryAccount?.accountType,
          });
        } catch (logError) {
          console.warn(
            `[Whitelist] Failed to send verification log for new member ${member.displayName}:`,
            logError,
          );
        }
      }

      // Publish whitelist with contextual commit message after adding new member (use permissions)
      try {
        const username =
          member.displayName || member.user?.username || member.id;
        // Determine permissions user now should have
        const { permissions } = await this.getExpectedFromDiscordRoles(roleIds);
        
        // Queue for batched update instead of immediate publish
        const msg = this.buildCommitMessage(username, "added", permissions);
        whitelistManager.queueBatchedUpdate(member.id, msg);
        console.log(
          `[Whitelist] Queued GitHub repository update after new member ${member.displayName} joined`,
        );
      } catch (repoError) {
        console.warn(
          `[Whitelist] Failed to queue GitHub repository update after new member ${member.displayName} joined:`,
          repoError,
        );
      }
    } catch (error) {
      console.error(
        `[Whitelist] Error processing new member ${member.displayName}:`,
        error,
      );
    }
  }
  @On({ event: "guildMemberRemove" })
  async onGuildMemberRemove([
    member,
  ]: ArgsOf<"guildMemberRemove">): Promise<void> {
    try {
      // Use displayName or fallback to user info
      const memberName =
        member.displayName ||
        member.user?.displayName ||
        member.user?.username ||
        member.id;
      console.log(
        `[Whitelist] Member ${memberName} left/kicked/banned - removing from whitelist`,
      );

      // Get their whitelist roles before removal for logging
      const whitelistRoles = await this.getUserWhitelistRoles(member.id);

      // Always remove from whitelist when they leave the server (includes kicks/bans)
      await whitelistManager.removeUserFromWhitelistIfNoRoles(member.id);

      // Send whitelist log message if they had whitelist access
      if (whitelistRoles.length > 0) {
        try {
          const vrchatInfo = await whitelistManager.getUserByDiscordId(
            member.id,
          );
          const primaryAccount = vrchatInfo?.vrchatAccounts?.[0];
          await sendWhitelistLog(member.client, member.guild.id, {
            discordId: member.id,
            displayName: memberName,
            vrchatUsername: primaryAccount?.vrchatUsername || undefined,
            vrcUserId: primaryAccount?.vrcUserId,
            roles: whitelistRoles,
            action: "removed",
            accountType: primaryAccount?.accountType,
          });
        } catch (logError) {
          console.warn(
            `[Whitelist] Failed to send removal log for ${memberName}:`,
            logError,
          );
        }

        // Publish whitelist with contextual commit message after removing user
        // Only queue if they actually had whitelist access
        try {
          const username = memberName;
          
          // Queue for batched update instead of immediate publish
          const msg = `${username} was removed with the roles none`;
          whitelistManager.queueBatchedUpdate(member.id, msg);
          console.log(
            `[Whitelist] Queued GitHub repository update after ${memberName} left server`,
          );
        } catch (repoError) {
          console.warn(
            `[Whitelist] Failed to queue GitHub repository update after ${memberName} left server:`,
            repoError,
          );
        }
      }
    } catch (error) {
      const memberName =
        member.displayName ||
        member.user?.displayName ||
        member.user?.username ||
        member.id;
      console.error(
        `[Whitelist] Error removing member ${memberName} from whitelist:`,
        error,
      );
    }
  }

  @On({ event: "guildBanAdd" })
  async onGuildBanAdd([ban]: ArgsOf<"guildBanAdd">): Promise<void> {
    try {
      const user = ban.user;
      const userName = user.displayName || user.username || user.id;
      console.log(
        `[Whitelist] User ${userName} was banned - ensuring removal from whitelist`,
      );

      // Get their whitelist roles before removal for logging
      const whitelistRoles = await this.getUserWhitelistRoles(user.id);

      // Ensure banned user is removed from whitelist
      await whitelistManager.removeUserFromWhitelistIfNoRoles(user.id);

      // Send whitelist log message if they had whitelist access
      if (whitelistRoles.length > 0) {
        try {
          const vrchatInfo = await whitelistManager.getUserByDiscordId(user.id);
          const primaryAccount = vrchatInfo?.vrchatAccounts?.[0];
          await sendWhitelistLog(ban.client, ban.guild.id, {
            discordId: user.id,
            displayName: userName,
            vrchatUsername: primaryAccount?.vrchatUsername || undefined,
            vrcUserId: primaryAccount?.vrcUserId,
            roles: whitelistRoles,
            action: "removed",
            accountType: primaryAccount?.accountType,
          });
        } catch (logError) {
          console.warn(
            `[Whitelist] Failed to send removal log for banned user ${userName}:`,
            logError,
          );
        }
      }

      // Publish whitelist with contextual commit message after removing banned user
      try {
        const username = userName;
        
        // Queue for batched update instead of immediate publish
        const msg = `${username} was removed with the roles none`;
        whitelistManager.queueBatchedUpdate(user.id, msg);
        console.log(
          `[Whitelist] Queued GitHub repository update after ${userName} was banned`,
        );
      } catch (repoError) {
        console.warn(
          `[Whitelist] Failed to queue GitHub repository update after ${userName} was banned:`,
          repoError,
        );
      }
    } catch (error) {
      const userName =
        ban.user?.displayName ||
        ban.user?.username ||
        ban.user?.id ||
        "Unknown";
      console.error(
        `[Whitelist] Error removing banned user ${userName} from whitelist:`,
        error,
      );
    }
  }

  private async hasVRChatAccount(discordId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { discordId },
      include: {
        vrchatAccounts: {
          where: {
            accountType: {
              in: ["MAIN", "ALT", "UNVERIFIED"],
            },
          },
        },
      },
    });

    return user ? user.vrchatAccounts.length > 0 : false;
  }

  private async getUserWhitelistRoles(discordId: string): Promise<string[]> {
    try {
      const user = await prisma.user.findUnique({
        where: { discordId },
        include: {
          whitelistEntry: {
            include: {
              roleAssignments: {
                include: {
                  role: true,
                },
              },
            },
          },
        },
      });

      // Extract VRChat roles from permissions field (comma-separated)
      const roles = new Set<string>();
      for (const assignment of user?.whitelistEntry?.roleAssignments || []) {
        if (assignment.role.permissions) {
          for (const role of String(assignment.role.permissions)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)) {
            roles.add(role);
          }
        }
      }
      return Array.from(roles).sort();
    } catch (error) {
      console.error(
        `[WhitelistRoleSync] Failed to get whitelist roles for ${discordId}:`,
        error,
      );
      return [];
    }
  }
}
