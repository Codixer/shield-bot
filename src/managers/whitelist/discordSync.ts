import { prisma } from "../../main.js";
import { bot } from "../../main.js";
import { loggers } from "../../utility/logger.js";

/**
 * Discord role synchronization operations
 */
export class DiscordSync {
  /**
   * Sync user roles from Discord
   */
  async syncUserRolesFromDiscord(
    discordId: string,
    discordRoleIds: string[],
    guildId?: string,
    removeUserFromWhitelistIfNoRoles?: (_discordId: string) => Promise<void>,
  ): Promise<void> {
    // Ensure user exists in database first
    const user = await prisma.user.findUnique({ 
      where: { discordId },
      include: {
        vrchatAccounts: true,
      },
    });
    
    if (!user) {
      loggers.bot.debug(
        `User ${discordId} not found in database, skipping sync`,
      );
      return;
    }

    // Check if user has any verified VRChat accounts (MAIN or ALT)
    const hasVerifiedAccount = user.vrchatAccounts?.some(
      (acc: { accountType: string }) => acc.accountType === "MAIN" || acc.accountType === "ALT"
    ) ?? false;

    if (!hasVerifiedAccount) {
      // User is not verified, remove from whitelist if present
      if (removeUserFromWhitelistIfNoRoles) {
        await removeUserFromWhitelistIfNoRoles(discordId);
      }
      loggers.bot.info(
        `User ${discordId} has no verified VRChat accounts - removed from whitelist`,
      );
      return;
    }

    // Get mapped roles for the user's Discord roles
    const mappedRoles = await prisma.whitelistRole.findMany({
      where: {
        discordRoleId: {
          in: discordRoleIds,
        },
      },
    });

    // Filter mapped roles by guild if guildId is provided
    let validMappedRoles = mappedRoles;
    if (guildId) {
      validMappedRoles = mappedRoles.filter((role: { guildId: string | null }) => role.guildId === guildId);
      
      if (validMappedRoles.length < mappedRoles.length) {
        const invalidCount = mappedRoles.length - validMappedRoles.length;
        loggers.bot.debug(
          `User ${discordId} has ${invalidCount} role(s) from other guilds - filtering them out`,
        );
      }
    }

    if (validMappedRoles.length === 0) {
      // User has no qualifying roles, remove from whitelist if present
      if (removeUserFromWhitelistIfNoRoles) {
        await removeUserFromWhitelistIfNoRoles(discordId);
      }
      loggers.bot.info(
        `User ${discordId} has no qualifying Discord roles - removed from whitelist`,
      );
      return;
    }

    // Ensure user has whitelist entry
    await prisma.whitelistEntry.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    const whitelistEntry = await prisma.whitelistEntry.findUnique({
      where: { userId: user.id },
      include: {
        roleAssignments: true,
      },
    });

    // Get current role assignments
    if (!whitelistEntry) {
      loggers.bot.warn(`Whitelist entry not found for user ${discordId}`);
      return;
    }
    const existingAssignments = whitelistEntry.roleAssignments || [];
    const existingRoleIds = new Set(existingAssignments.map((a: { roleId: number }) => a.roleId));
    const newRoleIds = new Set(validMappedRoles.map((r: { id: number }) => r.id));

    // Remove assignments that are no longer valid (role no longer mapped to Discord roles)
    const assignmentsToRemove = existingAssignments.filter(
      (a: { roleId: number }) => !newRoleIds.has(a.roleId),
    );
    for (const assignment of assignmentsToRemove) {
      await prisma.whitelistRoleAssignment.delete({
        where: { id: assignment.id },
      });
    }

    // Add new role assignments for mapped roles that don't exist yet
    const rolesToAdd = validMappedRoles.filter((r: { id: number }) => !existingRoleIds.has(r.id));
    for (const role of rolesToAdd) {
      await prisma.whitelistRoleAssignment.create({
        data: {
          whitelistId: whitelistEntry.id,
          roleId: role.id,
          assignedBy: "Discord Role Sync",
        },
      });
    }

    // Get permission list for logging
    const allPermissions = new Set<string>();
    for (const role of validMappedRoles) {
      if (role.permissions) {
        role.permissions
          .split(",")
          .map((p: string) => p.trim())
          .filter(Boolean)
          .forEach((p: string) => allPermissions.add(p));
      }
    }

    loggers.bot.info(
      `User ${discordId} synced with ${validMappedRoles.length} role(s) and permissions: [${Array.from(allPermissions).join(", ")}]`,
    );
  }

  /**
   * Ensure unverified accounts get basic whitelist access
   */
  async ensureUnverifiedAccountAccess(
    discordId: string,
    getDiscordRoleMappings: (_guildId?: string) => Promise<unknown[]>,
    syncAndPublishAfterVerification: (_discordId: string, _botOverride?: unknown) => Promise<void>,
  ): Promise<void> {
    // Get user with VRChat accounts
    const user = await prisma.user.findUnique({
      where: { discordId },
      include: { vrchatAccounts: true },
    });

    if (!user || !user.vrchatAccounts || user.vrchatAccounts.length === 0) {
      return; // No VRChat accounts
    }

    // Check if user has any verified accounts
    const hasVerifiedAccount = user.vrchatAccounts.some(
      (acc) => acc.accountType === "MAIN" || acc.accountType === "ALT",
    );

    // If user has verified accounts, don't give basic access (they get full role-based access)
    if (hasVerifiedAccount) {
      return;
    }

    // Check if user has unverified accounts
    const hasUnverifiedAccount = user.vrchatAccounts.some(
      (acc) => acc.accountType === "UNVERIFIED",
    );

    if (!hasUnverifiedAccount) {
      return; // No unverified accounts
    }

    // Ensure user has whitelist entry for basic access
    await prisma.whitelistEntry.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    loggers.bot.info(
      `Granted basic access to unverified account for user ${discordId}`,
    );

    // Now check if user has eligible Discord roles for full sync and publish
    try {
      let member: unknown = null;
      
      // First try cache across all guilds (no API calls)
      for (const guild of bot.guilds.cache.values()) {
        member = guild.members.cache.get(discordId);
        if (member) {break;}
      }

      // If not in cache, try to fetch from verification guild or first guild
      if (!member) {
        // Check if any account has a verification guild ID
        const verificationGuildId = user.vrchatAccounts.find((acc: { verificationGuildId: string | null }) => acc.verificationGuildId)?.verificationGuildId;
        
        if (verificationGuildId) {
          try {
            const guild = await bot.guilds.fetch(verificationGuildId).catch(() => null);
            if (guild) {
              member = await guild.members.fetch(discordId).catch(() => null);
            }
          } catch {
            // Failed to fetch from verification guild
          }
        }
        
        // Fallback to first guild if still not found
        if (!member) {
          const guild = bot.guilds.cache.first();
          if (guild) {
            try {
              member = await guild.members.fetch(discordId).catch(() => null);
            } catch {
              // User not found
            }
          }
        }
      }

      if (!member) {
        loggers.bot.debug(
          `Discord user ${discordId} not found in any guild; skipping full sync`,
        );
        return;
      }

      const roleIds: string[] = (member as { roles: { cache: { map: (_fn: (_role: unknown) => string) => string[] } } }).roles.cache.map((_role: unknown) => (_role as { id: string }).id);
      if (!roleIds.length) {
        loggers.bot.debug(
          `Discord user ${discordId} has no roles; skipping full sync`,
        );
        return;
      }

      // Check for eligible mapped roles
      const mappings = await getDiscordRoleMappings();
      const eligible = mappings.filter(
        (m: unknown) => (m as { discordRoleId?: string }).discordRoleId && roleIds.includes((m as { discordRoleId: string }).discordRoleId),
      );
      if (eligible.length === 0) {
        loggers.bot.debug(
          `Discord user ${discordId} has no eligible mapped roles; skipping full sync`,
        );
        return;
      }

      // Perform full sync and publish
      await syncAndPublishAfterVerification(discordId);
    } catch (e) {
      loggers.bot.warn(
        `Failed to perform full sync for unverified user ${discordId}`,
        e,
      );
    }
  }

  /**
   * Sync whitelist roles and publish after user verification
   */
  async syncAndPublishAfterVerification(
    discordId: string,
    botOverride: unknown,
    getDiscordRoleMappings: (_guildId?: string) => Promise<unknown[]>,
    syncUserRolesFromDiscord: (_discordId: string, _roleIds: string[], _guildId?: string) => Promise<void>,
    getUserByDiscordId: (_discordId: string) => Promise<unknown>,
    getUserWhitelistRoles: (_discordId: string) => Promise<string[]>,
    queueBatchedUpdate: (_discordId: string, _commitMessage?: string) => void,
  ): Promise<void> {
    const activeBot = (botOverride ?? bot) as { guilds?: { cache?: { values: () => IterableIterator<unknown> }; fetch: (_guildId: string) => Promise<unknown> } };
    const guildManager = activeBot?.guilds;
    if (!guildManager) {
      loggers.bot.warn(
        `Discord client unavailable; skipping whitelist sync for ${discordId}`,
      );
      return;
    }
    const fallbackGuildId = "813926536457224212";
    try {
      // Find the Discord member across guilds
      let member: unknown = null;
      if (guildManager.cache) {
        for (const guild of guildManager.cache.values()) {
          try {
            member = await (guild as { members: { fetch: (_id: string) => Promise<unknown> } }).members.fetch(discordId);
            if (member) {break;}
          } catch {
            // Not in this guild; continue searching
          }
        }
      }

      // Fallback: explicitly fetch the primary guild if member still not found
      if (!member) {
        try {
          const fallbackGuild = await guildManager.fetch(fallbackGuildId) as { members: { fetch: (_id: string) => Promise<unknown> } } | null;
          if (fallbackGuild) {
            try {
              member = await fallbackGuild.members.fetch(discordId);
            } catch {
              // Member not in fallback guild
            }
          }
        } catch (fetchError) {
          loggers.bot.warn(
            `Failed to fetch fallback guild ${fallbackGuildId}`,
            fetchError,
          );
        }
      }

      if (!member) {
        loggers.bot.debug(
          `Discord user ${discordId} not found in any guild; skipping whitelist sync`,
        );
        return;
      }

      const roleIds: string[] = (member as { roles: { cache: { map: (_fn: (_role: unknown) => string) => string[] } } }).roles.cache.map((_role: unknown) => (_role as { id: string }).id);
      if (!roleIds.length) {
        loggers.bot.debug(
          `Discord user ${discordId} has no roles; skipping whitelist sync`,
        );
        return;
      }

      // Determine if user has eligible mapped roles and collect permissions for commit message
      const mappings = await getDiscordRoleMappings();
      const eligible = mappings.filter(
        (m: unknown) => (m as { discordRoleId?: string }).discordRoleId && roleIds.includes((m as { discordRoleId: string }).discordRoleId),
      );
      if (eligible.length === 0) {
        loggers.bot.debug(
          `Discord user ${discordId} has no eligible mapped roles; skipping whitelist sync`,
        );
        return;
      }

      // Sync whitelist role assignments
      const guildId = (member as { guild: { id: string } }).guild.id;
      await syncUserRolesFromDiscord(discordId, roleIds, guildId);

      // Get VRChat account info and whitelist roles for logging (currently unused but kept for future use)
      void await getUserByDiscordId(discordId);
      void await getUserWhitelistRoles(discordId);

      // Build permissions list from mapping permissions
      const permSet = new Set<string>();
      for (const m of eligible) {
        const mapping = m as { permissions?: string };
        if (mapping.permissions) {
          for (const p of String(mapping.permissions)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean))
            {permSet.add(p);}
        }
      }
      const permissions = Array.from(permSet).sort();
      const who = (member as { displayName?: string; user?: { username?: string } }).displayName || (member as { user?: { username?: string } }).user?.username || discordId;
      const msg = `${who} was added with the roles ${permissions.length ? permissions.join(", ") : "none"}`;

      // Note: Whitelist logging is handled by the specific callers (verification handlers, account managers)
      // to ensure the correct context and action type (verified/removed) is logged

      // Queue batched update instead of immediate publish
      queueBatchedUpdate(discordId, msg);
      loggers.bot.info(
        `Queued repository update after verification for ${who}`,
      );
    } catch (e) {
      loggers.bot.warn(
        `Failed to sync/publish whitelist for verified user ${discordId}`,
        e,
      );
    }
  }
}

