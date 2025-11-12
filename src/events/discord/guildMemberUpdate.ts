import { ArgsOf, Discord, On } from "discordx";
import { prisma } from "../../main.js";
import { groupRoleSyncManager } from "../../managers/groupRoleSync/groupRoleSyncManager.js";

@Discord()
export class GuildMemberUpdateEvent {
  @On({ event: "guildMemberUpdate" })
  async onGuildMemberUpdate([oldMember, newMember]: ArgsOf<"guildMemberUpdate">) {
    try {
      // Check if roles actually changed
      const oldRoles = oldMember.roles.cache;
      const newRoles = newMember.roles.cache;

      if (oldRoles.size === newRoles.size && oldRoles.every(role => newRoles.has(role.id))) {
        // No role changes
        return;
      }

      console.log(
        `[GuildMemberUpdate] Roles changed for ${newMember.user.tag} in ${newMember.guild.name}`,
      );

      // Check if this guild has VRChat group sync configured
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: newMember.guild.id },
      });

      if (!settings?.vrcGroupId) {
        // No VRChat group configured for this guild
        return;
      }

      // Find the user's verified VRChat accounts
      const user = await prisma.user.findUnique({
        where: { discordId: newMember.id },
        include: {
          vrchatAccounts: {
            where: {
              accountType: { in: ["MAIN", "ALT"] },
            },
          },
        },
      });

      if (!user || user.vrchatAccounts.length === 0) {
        // User has no verified VRChat accounts
        return;
      }

      console.log(
        `[GuildMemberUpdate] Found ${user.vrchatAccounts.length} verified VRChat account(s) for ${newMember.user.tag}`,
      );

      // Sync VRChat roles for each verified account
      for (const vrcAccount of user.vrchatAccounts) {
        try {
          await groupRoleSyncManager.handleDiscordRoleUpdate(
            newMember.guild.id,
            newMember.id,
            vrcAccount.vrcUserId,
          );
        } catch (error) {
          console.error(
            `[GuildMemberUpdate] Error syncing VRChat roles for ${vrcAccount.vrcUserId}:`,
            error,
          );
        }
      }
    } catch (error) {
      console.error("[GuildMemberUpdate] Error handling member update:", error);
    }
  }
}
