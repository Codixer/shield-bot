import { Discord, On, ArgsOf } from 'discordx';
import { WhitelistManager } from "../../../managers/whitelist/whitelistManager.js";
import { prisma } from "../../../main.js";

const whitelistManager = new WhitelistManager();

@Discord()
export class WhitelistRoleSync {
  // Build a human commit message using permissions list
  private buildCommitMessage(username: string, action: 'added' | 'removed' | 'granted', permissions: Set<string>): string {
    const list = permissions.size ? Array.from(permissions).sort().join(', ') : 'none';
    return `${username} was ${action} with the roles ${list}`;
  }

  // Resolve expected whitelist roles and permissions based on Discord roles
  private async getExpectedFromDiscordRoles(discordRoleIds: string[]): Promise<{ roles: string[]; permissions: Set<string> }> {
    const roles: string[] = [];
    const permissions = new Set<string>();
    const roleMappings = await whitelistManager.getDiscordRoleMappings();
    for (const mapping of roleMappings) {
      if (!mapping.discordRoleId) continue;
      if (discordRoleIds.includes(mapping.discordRoleId)) {
        roles.push(mapping.name);
        const desc = mapping.description as string | null | undefined;
        if (desc) for (const p of desc.split(',').map((s: string) => s.trim()).filter(Boolean)) permissions.add(p);
      }
    }
    return { roles, permissions };
  }
  
  @On({ event: "guildMemberUpdate" })
  async onGuildMemberUpdate(
    [oldMember, newMember]: ArgsOf<"guildMemberUpdate">
  ): Promise<void> {
    try {
        console.log(`[Whitelist] Syncing roles for ${newMember.displayName} (${newMember.id})`);
        
      // Fetch full member data if oldMember is partial
      let fullOldMember = oldMember;
      if (oldMember.partial) {
        try {
          fullOldMember = await oldMember.fetch();
        } catch (error) {
          console.warn(`[Whitelist] Could not fetch full member data for ${oldMember.id}, using available data`);
          fullOldMember = oldMember;
        }
      }
        
      // Only process if roles changed
      const oldRoleIds = fullOldMember.roles?.cache?.map((role: any) => role.id) || [];
      const newRoleIds = newMember.roles?.cache?.map((role: any) => role.id) || [];

      console.log(`[Whitelist] Role comparison for ${newMember.displayName}: old=${oldRoleIds.length}, new=${newRoleIds.length}`);

      if (JSON.stringify(oldRoleIds.sort()) === JSON.stringify(newRoleIds.sort())) {
        console.log(`[Whitelist] No role changes detected for ${newMember.displayName}`);
        return; // No role changes
      }

      // Check if user has any VRChat accounts (verified or unverified)
      const userHasVRChatAccount = await this.hasVRChatAccount(newMember.id);
      if (!userHasVRChatAccount) {
        console.log(`[Whitelist] User ${newMember.displayName} has no VRChat account, skipping whitelist sync`);
        return;
      }

  // Get current and expected state
  const currentUser = await whitelistManager.getUserByDiscordId(newMember.id);
  const currentWhitelistRoles = currentUser?.whitelistEntry?.roleAssignments?.map((a: any) => a.role.name) || [];
  const { roles: expectedWhitelistRoles, permissions: expectedPermissions } = await this.getExpectedFromDiscordRoles(newRoleIds);
      
  // Compare current whitelist roles with expected roles using sets
  const currentRolesSorted = [...currentWhitelistRoles].sort();
  const expectedRolesSorted = [...expectedWhitelistRoles].sort();
      
      if (JSON.stringify(currentRolesSorted) === JSON.stringify(expectedRolesSorted)) {
        console.log(`[Whitelist] No whitelist role changes needed for ${newMember.displayName} - Current: [${currentRolesSorted.join(', ')}], Expected: [${expectedRolesSorted.join(', ')}]`);
        return; // No whitelist changes needed
      }

      console.log(`[Whitelist] Whitelist role changes detected for ${newMember.displayName} - Current: [${currentRolesSorted.join(', ')}], Expected: [${expectedRolesSorted.join(', ')}]`);
      
  // Sync user roles (this handles both granting and removing access based on current roles)
  await whitelistManager.syncUserRolesFromDiscord(newMember.id, newRoleIds);
      
      console.log(`[Whitelist] Successfully updated whitelist for ${newMember.displayName}`);
      
      // Publish whitelist with contextual commit message after role changes (use permissions, not Discord roles)
      try {
        const action: 'added' | 'removed' | 'granted' = expectedRolesSorted.length === 0
          ? 'removed'
          : (currentRolesSorted.length === 0 ? 'added' : 'granted');
        const username = newMember.displayName || newMember.user?.username || newMember.id;
        // Use expected permissions for commit message (if removed, show none)
        const permsForMsg = action === 'removed' ? new Set<string>() : expectedPermissions;
        await whitelistManager.publishWhitelist(this.buildCommitMessage(username, action, permsForMsg));
        console.log(`[Whitelist] GitHub repository updated after role change for ${newMember.displayName}`);
      } catch (repoError) {
        console.warn(`[Whitelist] Failed to update GitHub repository after role change for ${newMember.displayName}:`, repoError);
      }
    } catch (error) {
      console.error(`[Whitelist] Error syncing roles for ${newMember.displayName}:`, error);
    }
  }

  @On({ event: "guildMemberAdd" })
  async onGuildMemberAdd([member]: ArgsOf<"guildMemberAdd">): Promise<void> {
    try {
      const roleIds = member.roles.cache.map((role: any) => role.id);
      
      console.log(`[Whitelist] New member ${member.displayName} joined with ${roleIds.length} roles`);
      
      // Check if user has any VRChat accounts (verified or unverified)
      const userHasVRChatAccount = await this.hasVRChatAccount(member.id);
      if (!userHasVRChatAccount) {
        console.log(`[Whitelist] New member ${member.displayName} has no VRChat account, skipping whitelist sync`);
        return;
      }

      // Sync their roles (this will grant access if they have qualifying roles)
      await whitelistManager.syncUserRolesFromDiscord(member.id, roleIds);
      
      console.log(`[Whitelist] Successfully processed new member ${member.displayName}`);
      
      // Publish whitelist with contextual commit message after adding new member (use permissions)
      try {
        const username = member.displayName || member.user?.username || member.id;
        // Determine permissions user now should have
        const { permissions } = await this.getExpectedFromDiscordRoles(roleIds);
        await whitelistManager.publishWhitelist(this.buildCommitMessage(username, 'added', permissions));
        console.log(`[Whitelist] GitHub repository updated after new member ${member.displayName} joined`);
      } catch (repoError) {
        console.warn(`[Whitelist] Failed to update GitHub repository after new member ${member.displayName} joined:`, repoError);
      }
    } catch (error) {
      console.error(`[Whitelist] Error processing new member ${member.displayName}:`, error);
    }
  }  @On({ event: "guildMemberRemove" })
  async onGuildMemberRemove([member]: ArgsOf<"guildMemberRemove">): Promise<void> {
    try {
      // Use displayName or fallback to user info
      const memberName = member.displayName || member.user?.displayName || member.user?.username || member.id;
      console.log(`[Whitelist] Member ${memberName} left/kicked/banned - removing from whitelist`);
      
      // Always remove from whitelist when they leave the server (includes kicks/bans)
      await whitelistManager.removeUserFromWhitelistIfNoRoles(member.id);
      
      // Publish whitelist with contextual commit message after removing user
      try {
        const username = memberName;
        await whitelistManager.publishWhitelist(`${username} was removed with the roles none`);
        console.log(`[Whitelist] GitHub repository updated after ${memberName} left server`);
      } catch (repoError) {
        console.warn(`[Whitelist] Failed to update GitHub repository after ${memberName} left server:`, repoError);
      }
    } catch (error) {
      const memberName = member.displayName || member.user?.displayName || member.user?.username || member.id;
      console.error(`[Whitelist] Error removing member ${memberName} from whitelist:`, error);
    }
  }

  @On({ event: "guildBanAdd" })
  async onGuildBanAdd([ban]: ArgsOf<"guildBanAdd">): Promise<void> {
    try {
      const user = ban.user;
      const userName = user.displayName || user.username || user.id;
      console.log(`[Whitelist] User ${userName} was banned - ensuring removal from whitelist`);
      
      // Ensure banned user is removed from whitelist
      await whitelistManager.removeUserFromWhitelistIfNoRoles(user.id);
      
      // Publish whitelist with contextual commit message after removing banned user
      try {
        const username = userName;
        await whitelistManager.publishWhitelist(`${username} was removed with the roles none`);
        console.log(`[Whitelist] GitHub repository updated after ${userName} was banned`);
      } catch (repoError) {
        console.warn(`[Whitelist] Failed to update GitHub repository after ${userName} was banned:`, repoError);
      }
    } catch (error) {
      const userName = ban.user?.displayName || ban.user?.username || ban.user?.id || 'Unknown';
      console.error(`[Whitelist] Error removing banned user ${userName} from whitelist:`, error);
    }
  }

  private async hasVRChatAccount(discordId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { discordId },
      include: {
        vrchatAccounts: {
          where: { 
            accountType: {
              in: ['MAIN', 'ALT', 'UNVERIFIED']
            }
          }
        }
      }
    });

    return user ? user.vrchatAccounts.length > 0 : false;
  }
}
