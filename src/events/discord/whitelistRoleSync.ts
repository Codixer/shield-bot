import { Discord, On, ArgsOf } from 'discordx';
import { WhitelistManager } from "../../managers/whitelist/whitelistManager.js";

const whitelistManager = new WhitelistManager();

@Discord()
export class WhitelistRoleSync {
  
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

      // Get current whitelist roles for this user
      const currentUser = await whitelistManager.getUserByDiscordId(newMember.id);
      const currentWhitelistRoles = currentUser?.whitelistEntry?.roleAssignments?.map((assignment: any) => assignment.role.name) || [];
      
      // Check what whitelist roles they should have based on new Discord roles
      const shouldBeWhitelisted = await whitelistManager.shouldUserBeWhitelisted(newRoleIds);
      const expectedWhitelistRoles: string[] = [];
      
      if (shouldBeWhitelisted) {
        // Get the roles they should have based on Discord role mappings
        const roleMappings = await whitelistManager.getDiscordRoleMappings();
        for (const mapping of roleMappings) {
          if (newRoleIds.includes(mapping.discordRoleId)) {
            expectedWhitelistRoles.push(mapping.name);
          }
        }
      }

      // Compare current whitelist roles with expected roles
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
      
      // Update GitHub Gist after role changes
      try {
        await whitelistManager.updateGistWithWhitelist();
        console.log(`[Whitelist] GitHub Gist updated after role change for ${newMember.displayName}`);
      } catch (gistError) {
        console.warn(`[Whitelist] Failed to update GitHub Gist after role change for ${newMember.displayName}:`, gistError);
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
      
      // Update GitHub Gist after adding new member
      try {
        await whitelistManager.updateGistWithWhitelist();
        console.log(`[Whitelist] GitHub Gist updated after new member ${member.displayName} joined`);
      } catch (gistError) {
        console.warn(`[Whitelist] Failed to update GitHub Gist after new member ${member.displayName} joined:`, gistError);
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
      
      // Update GitHub Gist after removing user
      try {
        await whitelistManager.updateGistWithWhitelist();
        console.log(`[Whitelist] GitHub Gist updated after ${memberName} left server`);
      } catch (gistError) {
        console.warn(`[Whitelist] Failed to update GitHub Gist after ${memberName} left server:`, gistError);
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
      
      // Update GitHub Gist after removing banned user
      try {
        await whitelistManager.updateGistWithWhitelist();
        console.log(`[Whitelist] GitHub Gist updated after ${userName} was banned`);
      } catch (gistError) {
        console.warn(`[Whitelist] Failed to update GitHub Gist after ${userName} was banned:`, gistError);
      }
    } catch (error) {
      const userName = ban.user?.displayName || ban.user?.username || ban.user?.id || 'Unknown';
      console.error(`[Whitelist] Error removing banned user ${userName} from whitelist:`, error);
    }
  }

  private async hasVRChatAccount(discordId: string): Promise<boolean> {
    const { prisma } = await import("../../main.js");
    
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
