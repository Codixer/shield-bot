import { prisma } from "../../main.js";

/**
 * Role operations for whitelist management
 */
export class WhitelistRoleOperations {
  /**
   * Create a new role
   */
  async createRole(
    guildId: string,
    permissions?: string,
    discordRoleId?: string,
  ): Promise<unknown> {
    return await prisma.whitelistRole.create({
      data: {
        guildId,
        permissions,
        discordRoleId,
      },
    });
  }

  /**
   * Delete a role by ID
   */
  async deleteRole(guildId: string, discordRoleId: string): Promise<boolean> {
    try {
      await prisma.whitelistRole.delete({
        where: { 
          guildId_discordRoleId: {
            guildId,
            discordRoleId
          }
        },
      });
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Assign a role to a user by Discord ID
   */
  async assignRoleByDiscordId(
    discordId: string,
    roleId: number,
    assignedBy?: string,
    expiresAt?: Date,
  ): Promise<unknown> {
    const user = await prisma.user.findUnique({ where: { discordId } });
    if (!user) {
      throw new Error("User not found");
    }

    const role = await prisma.whitelistRole.findUnique({
      where: { id: roleId },
    });
    if (!role) {
      throw new Error(`Role with ID "${roleId}" not found`);
    }

    // Ensure user has a whitelist entry
    await prisma.whitelistEntry.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    // Check if assignment already exists
    const existingAssignment = await prisma.whitelistRoleAssignment.findFirst({
      where: {
        whitelist: { userId: user.id },
        roleId: role.id,
      },
    });

    if (existingAssignment) {
      // Update existing assignment
      return await prisma.whitelistRoleAssignment.update({
        where: { id: existingAssignment.id },
        data: {
          assignedBy,
          expiresAt,
        },
      });
    } else {
      // Create new assignment
      const whitelistEntry = await prisma.whitelistEntry.findUnique({
        where: { userId: user.id },
      });

      if (!whitelistEntry) {
        throw new Error("Whitelist entry not found after upsert");
      }

      return await prisma.whitelistRoleAssignment.create({
        data: {
          whitelistId: whitelistEntry.id,
          roleId: role.id,
          assignedBy,
          expiresAt,
        },
      });
    }
  }

  /**
   * Remove a role from a user by Discord ID
   */
  async removeRoleByDiscordId(
    discordId: string,
    roleId: number,
  ): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({ where: { discordId } });
      if (!user) {return false;}

      const role = await prisma.whitelistRole.findUnique({
        where: { id: roleId },
      });
      if (!role) {return false;}

      const result = await prisma.whitelistRoleAssignment.deleteMany({
        where: {
          whitelist: { userId: user.id },
          roleId: role.id,
        },
      });

      return result.count > 0;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Get all roles
   */
  async getAllRoles(): Promise<unknown[]> {
    return await prisma.whitelistRole.findMany({
      include: {
        roleAssignments: true,
      },
    });
  }

  /**
   * Setup Discord role mapping
   */
  async setupDiscordRoleMapping(
    discordRoleId: string,
    guildId: string,
    permissions: string[],
  ): Promise<unknown> {
    // Check if role already exists for this guild and discord role
    const existingRole = await prisma.whitelistRole.findFirst({
      where: {
        guildId,
        discordRoleId,
      },
    });

    if (existingRole) {
      // Update existing role
      return await prisma.whitelistRole.update({
        where: { id: existingRole.id },
        data: {
          permissions: permissions.join(", "),
        },
      });
    } else {
      // Create new role
      return await prisma.whitelistRole.create({
        data: {
          guildId,
          discordRoleId: discordRoleId,
          permissions: permissions.join(", "),
        },
      });
    }
  }

  /**
   * Get Discord role mappings, optionally filtered by guild
   */
  async getDiscordRoleMappings(guildId?: string): Promise<unknown[]> {
    return await prisma.whitelistRole.findMany({
      where: {
        discordRoleId: {
          not: null,
        },
        ...(guildId && { guildId }),
      },
    });
  }

  /**
   * Check if user should be whitelisted based on Discord roles
   */
  async shouldUserBeWhitelisted(discordRoleIds: string[], guildId?: string): Promise<boolean> {
    const mappedRoles = await prisma.whitelistRole.findMany({
      where: {
        discordRoleId: {
          in: discordRoleIds,
        },
        ...(guildId && { guildId }),
      },
    });

    return mappedRoles.length > 0;
  }

  /**
   * Clean up expired role assignments
   */
  async cleanupExpiredRoles(): Promise<number> {
    const result = await prisma.whitelistRoleAssignment.deleteMany({
      where: {
        expiresAt: { lte: new Date() },
      },
    });

    return result.count;
  }

  /**
   * Assign role by VRChat User ID
   */
  async assignRoleByVrcUserId(
    vrcUserId: string,
    roleId: number,
    getUserByVrcUserId: (vrcUserId: string) => Promise<unknown>,
    assignedBy?: string,
    expiresAt?: Date,
  ): Promise<unknown> {
    const user = await getUserByVrcUserId(vrcUserId) as { discordId?: string } | null;
    if (!user || !user.discordId) {
      throw new Error("User not found in database");
    }
    return await this.assignRoleByDiscordId(
      user.discordId,
      roleId,
      assignedBy,
      expiresAt,
    );
  }
}

