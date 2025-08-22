import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class WhitelistManager {

  /**
   * Get a user from the database by Discord ID
   */
  async getUserByDiscordId(discordId: string) {
    return await prisma.user.findUnique({
      where: { discordId },
      include: {
        vrchatAccounts: true,
        whitelistEntry: {
          include: {
            roleAssignments: {
              include: {
                role: true
              }
            }
          }
        }
      }
    });
  }

  /**
   * Get a user from the database by VRChat User ID
   */
  async getUserByVrcUserId(vrcUserId: string) {
    return await prisma.user.findFirst({
      where: {
        vrchatAccounts: {
          some: {
            vrcUserId: vrcUserId
          }
        }
      },
      include: {
        vrchatAccounts: true,
        whitelistEntry: {
          include: {
            roleAssignments: {
              include: {
                role: true
              }
            }
          }
        }
      }
    });
  }

  /**
   * Add a user to the whitelist by Discord ID
   */
  async addUserByDiscordId(discordId: string): Promise<any> {
    const user = await prisma.user.findUnique({ where: { discordId } });
    if (!user) {
      throw new Error("User not found in the database. User must be verified first.");
    }

    // Check if already whitelisted
    const existing = await prisma.whitelistEntry.findUnique({
      where: { userId: user.id }
    });

    if (existing) {
      throw new Error("User is already whitelisted.");
    }

    return await prisma.whitelistEntry.create({
      data: { userId: user.id },
      include: {
        user: {
          include: {
            vrchatAccounts: true
          }
        }
      }
    });
  }

  /**
   * Add a user to the whitelist by VRChat username
   */
  async addUserByVrcUsername(vrchatUsername: string): Promise<any> {
    try {
      const { searchUsers } = await import('../../utility/vrchat/user.js');
      const searchResults = await searchUsers({ search: vrchatUsername, n: 1 });
      
      if (searchResults.length === 0) {
        throw new Error(`VRChat user "${vrchatUsername}" not found.`);
      }

      const vrcUser = searchResults[0];
      
      // Find the corresponding user in our database
      const user = await prisma.user.findFirst({
        where: {
          vrchatAccounts: {
            some: {
              vrcUserId: vrcUser.id
            }
          }
        }
      });

      if (!user) {
        throw new Error(`User with VRChat account "${vrchatUsername}" not found in database. User must be verified first.`);
      }

      return await this.addUserByDiscordId(user.discordId);
    } catch (error: any) {
      throw new Error(`Failed to add user by VRChat username: ${error.message}`);
    }
  }

  /**
   * Remove a user from the whitelist by Discord ID
   */
  async removeUserByDiscordId(discordId: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({ where: { discordId } });
      if (!user) return false;

      await prisma.whitelistEntry.delete({
        where: { userId: user.id }
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Remove a user from the whitelist by VRChat User ID
   */
  async removeUserByVrcUserId(vrcUserId: string): Promise<boolean> {
    const user = await this.getUserByVrcUserId(vrcUserId);
    if (!user) return false;

    return await this.removeUserByDiscordId(user.discordId);
  }

  /**
   * Create a new role
   */
  async createRole(name: string, description?: string, discordRoleId?: string): Promise<any> {
    return await prisma.whitelistRole.create({
      data: {
        name,
        description,
        discordRoleId
      }
    });
  }

  /**
   * Delete a role
   */
  async deleteRole(roleName: string): Promise<boolean> {
    try {
      await prisma.whitelistRole.delete({
        where: { name: roleName }
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Assign a role to a user by Discord ID
   */
  async assignRoleByDiscordId(discordId: string, roleName: string, assignedBy?: string, expiresAt?: Date): Promise<any> {
    const user = await prisma.user.findUnique({ where: { discordId } });
    if (!user) {
      throw new Error("User not found");
    }

    const role = await prisma.whitelistRole.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new Error(`Role "${roleName}" not found`);
    }

    // Ensure user has a whitelist entry
    await prisma.whitelistEntry.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id }
    });

    // Check if assignment already exists
    const existingAssignment = await prisma.whitelistRoleAssignment.findFirst({
      where: {
        whitelist: { userId: user.id },
        roleId: role.id
      }
    });

    if (existingAssignment) {
      // Update existing assignment
      return await prisma.whitelistRoleAssignment.update({
        where: { id: existingAssignment.id },
        data: {
          assignedBy,
          expiresAt
        }
      });
    } else {
      // Create new assignment
      const whitelistEntry = await prisma.whitelistEntry.findUnique({
        where: { userId: user.id }
      });

      return await prisma.whitelistRoleAssignment.create({
        data: {
          whitelistId: whitelistEntry!.id,
          roleId: role.id,
          assignedBy,
          expiresAt
        }
      });
    }
  }

  /**
   * Remove a role from a user by Discord ID
   */
  async removeRoleByDiscordId(discordId: string, roleName: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({ where: { discordId } });
      if (!user) return false;

      const role = await prisma.whitelistRole.findUnique({ where: { name: roleName } });
      if (!role) return false;

      const result = await prisma.whitelistRoleAssignment.deleteMany({
        where: {
          whitelist: { userId: user.id },
          roleId: role.id
        }
      });

      return result.count > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all users in the whitelist
   */
  async getWhitelistUsers(): Promise<any[]> {
    const entries = await prisma.whitelistEntry.findMany({
      include: {
        user: {
          include: {
            vrchatAccounts: true
          }
        },
        roleAssignments: {
          include: {
            role: true
          },
          where: {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } }
            ]
          }
        }
      }
    });

    const usersWithCurrentNames = [];

    for (const entry of entries) {
      // Get all VRChat accounts for this user (MAIN, ALT, and UNVERIFIED)
      const validAccounts = entry.user.vrchatAccounts?.filter(acc => 
        acc.accountType === 'MAIN' || acc.accountType === 'ALT' || acc.accountType === 'UNVERIFIED'
      ) || [];

      if (validAccounts.length === 0) {
        continue; // Skip users without any valid VRChat accounts
      }

      // Get unique permissions from all roles (deduplicated)
      const allPermissions = new Set<string>();
      for (const assignment of entry.roleAssignments) {
        if (assignment.role.description) {
          // Split permissions by comma and add each one
          const permissions = assignment.role.description.split(',').map((p: string) => p.trim());
          permissions.forEach((permission: string) => {
            if (permission) allPermissions.add(permission);
          });
        }
      }

      // Create an entry for each VRChat account
      for (const vrchatAccount of validAccounts) {
        const vrchatUsername = vrchatAccount.vrchatUsername || vrchatAccount.vrcUserId || 'Unknown';
        
        usersWithCurrentNames.push({
          discordId: entry.user.discordId,
          vrchatUsername,
          roles: Array.from(allPermissions), // These are the actual permissions (station, truavatar, etc.)
          roleNames: entry.roleAssignments.map((assignment: any) => assignment.role.name), // These are the role names
          createdAt: entry.createdAt,
          accountType: vrchatAccount.accountType || 'UNKNOWN',
          vrcUserId: vrchatAccount.vrcUserId
        });
      }
    }

    return usersWithCurrentNames;
  }

  /**
   * Get all roles
   */
  async getAllRoles(): Promise<any[]> {
    return await prisma.whitelistRole.findMany({
      include: {
        roleAssignments: true
      }
    });
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<any> {
    const [totalUsers, totalRoles, totalActiveAssignments, totalExpiredAssignments] = await Promise.all([
      prisma.whitelistEntry.count(),
      prisma.whitelistRole.count(),
      prisma.whitelistRoleAssignment.count({
        where: {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      }),
      prisma.whitelistRoleAssignment.count({
        where: {
          expiresAt: { lte: new Date() }
        }
      })
    ]);

    return {
      totalUsers,
      totalRoles,
      totalActiveAssignments,
      totalExpiredAssignments
    };
  }

  /**
   * Clean up expired role assignments
   */
  async cleanupExpiredRoles(): Promise<number> {
    const result = await prisma.whitelistRoleAssignment.deleteMany({
      where: {
        expiresAt: { lte: new Date() }
      }
    });

    return result.count;
  }

  /**
   * Generate raw whitelist content 
   */
  async generateWhitelistContent(): Promise<string> {
    const users = await this.getWhitelistUsers();
    
    if (users.length === 0) {
      return '';
    }
    
    return users.map(user => {
      const roles = user.roles.join(':'); // Use colon separator for roles
      return `${user.vrchatUsername},${roles}`; // Use comma separator between username and roles
    }).join('\n');
  }

  /**
   * Generate encoded whitelist for PowerShell consumption
   */
  async generateEncodedWhitelist(): Promise<string> {
    const content = await this.generateWhitelistContent();
    return this.xorEncode(content);
  }

  /**
   * Update GitHub Gist with base64 encoded whitelist data
   */
  async updateGistWithWhitelist(): Promise<any> {
    const gistId = process.env.GITHUB_GIST_ID;
    const githubToken = process.env.GITHUB_TOKEN;
    const filename = process.env.GITHUB_GIST_FILENAME || 'whitelist.txt';

    if (!gistId) {
      throw new Error('GITHUB_GIST_ID environment variable is required');
    }

    if (!githubToken) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }

    // Generate the base64 encoded whitelist data
    const encodedData = await this.generateEncodedWhitelist();

    const requestBody = {
      description: `Whitelist updated at ${new Date().toISOString()}`,
      files: {
        [filename]: {
          content: encodedData
        }
      }
    };

    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${githubToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update gist: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * XOR encode the content using the configured key (matching PowerShell script)
   */
  private xorEncode(content: string): string {
    const xorKey = process.env.WHITELIST_XOR_KEY || 'SHIELD_KEY_6272025';
    
    // Normalize line endings to LF only (\n), but KEEP them
    const normalizedContent = content.replace(/\r\n/g, '\n').trim();
    
    // Calculate checksum (over the UTF-8 bytes of the full text including newlines)
    const contentBytesForChecksum = Buffer.from(normalizedContent, 'utf8');
    let checksum = 0;
    for (const byte of contentBytesForChecksum) {
      checksum += byte;
    }
    
    const contentWithChecksum = `${normalizedContent}|${checksum}`;
    
    // Convert to UTF-8 bytes
    const contentBytes = Buffer.from(contentWithChecksum, 'utf8');
    const keyBytes = Buffer.from(xorKey, 'utf8');
    
    if (keyBytes.length === 0) {
      throw new Error('XOR key cannot be empty');
    }
    
    // XOR encryption
    const xoredBytes = Buffer.alloc(contentBytes.length);
    for (let i = 0; i < contentBytes.length; i++) {
      xoredBytes[i] = contentBytes[i] ^ keyBytes[i % keyBytes.length];
    }
    
    // Base64 encode
    return xoredBytes.toString('base64');
  }

  /**
   * Sync user roles from Discord
   */
  async syncUserRolesFromDiscord(discordId: string, discordRoleIds: string[]): Promise<void> {
    // Get mapped roles for the user's Discord roles
    const mappedRoles = await prisma.whitelistRole.findMany({
      where: {
        discordRoleId: {
          in: discordRoleIds
        }
      }
    });

    if (mappedRoles.length === 0) {
      // User has no qualifying roles, remove from whitelist if present
      await this.removeUserFromWhitelistIfNoRoles(discordId);
      return;
    }

    // Ensure user exists in database
    const user = await prisma.user.findUnique({ where: { discordId } });
    if (!user) {
      console.log(`[Whitelist] User ${discordId} not found in database, skipping sync`);
      return;
    }

    // Ensure user has whitelist entry
    await prisma.whitelistEntry.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id }
    });

    const whitelistEntry = await prisma.whitelistEntry.findUnique({
      where: { userId: user.id }
    });

    // Remove existing role assignments that aren't in the mapped roles
    await prisma.whitelistRoleAssignment.deleteMany({
      where: {
        whitelistId: whitelistEntry!.id,
        role: {
          discordRoleId: {
            not: null,
            notIn: discordRoleIds
          }
        }
      }
    });

    // Add new role assignments for mapped roles
    for (const role of mappedRoles) {
      await prisma.whitelistRoleAssignment.upsert({
        where: {
          whitelistId_roleId: {
            whitelistId: whitelistEntry!.id,
            roleId: role.id
          }
        },
        update: {
          // No updatedAt field needed - it's auto-managed
        },
        create: {
          whitelistId: whitelistEntry!.id,
          roleId: role.id,
          assignedBy: 'Discord Role Sync'
        }
      });
    }
  }

  /**
   * Ensure unverified accounts get basic whitelist access
   */
  async ensureUnverifiedAccountAccess(discordId: string): Promise<void> {
    // Get user with VRChat accounts
    const user = await prisma.user.findUnique({
      where: { discordId },
      include: { vrchatAccounts: true }
    });

    if (!user || !user.vrchatAccounts || user.vrchatAccounts.length === 0) {
      return; // No VRChat accounts
    }

    // Check if user has any verified accounts
    const hasVerifiedAccount = user.vrchatAccounts.some(acc => acc.accountType === 'MAIN' || acc.accountType === 'ALT');
    
    // If user has verified accounts, don't give basic access (they get full role-based access)
    if (hasVerifiedAccount) {
      return;
    }

    // Check if user has unverified accounts
    const hasUnverifiedAccount = user.vrchatAccounts.some(acc => acc.accountType === 'UNVERIFIED');
    
    if (!hasUnverifiedAccount) {
      return; // No unverified accounts
    }

    // Ensure user has whitelist entry for basic access
    await prisma.whitelistEntry.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id }
    });

    console.log(`[Whitelist] Granted basic access to unverified account for user ${discordId}`);
  }

  /**
   * Remove user from whitelist if they have no qualifying roles
   */
  async removeUserFromWhitelistIfNoRoles(discordId: string): Promise<void> {
    const user = await this.getUserByDiscordId(discordId);
    if (!user || !user.whitelistEntry) return;

    // Remove whitelist entry
    await prisma.whitelistEntry.delete({
      where: { userId: user.id }
    });
  }

  /**
   * Setup Discord role mapping
   */
  async setupDiscordRoleMapping(discordRoleId: string, roleName: string, permissions: string[]): Promise<any> {
    // Check if role already exists
    const existingRole = await prisma.whitelistRole.findFirst({
      where: {
        OR: [
          { name: roleName },
          { discordRoleId: discordRoleId }
        ]
      }
    });

    if (existingRole) {
      // Update existing role
      return await prisma.whitelistRole.update({
        where: { id: existingRole.id },
        data: {
          name: roleName,
          discordRoleId: discordRoleId,
          description: permissions.join(', ')
        }
      });
    } else {
      // Create new role
      return await prisma.whitelistRole.create({
        data: {
          name: roleName,
          discordRoleId: discordRoleId,
          description: permissions.join(', ')
        }
      });
    }
  }

  /**
   * Get Discord role mappings
   */
  async getDiscordRoleMappings(): Promise<any[]> {
    return await prisma.whitelistRole.findMany({
      where: {
        discordRoleId: {
          not: null
        }
      }
    });
  }

  /**
   * Check if user should be whitelisted based on Discord roles
   */
  async shouldUserBeWhitelisted(discordRoleIds: string[]): Promise<boolean> {
    const mappedRoles = await prisma.whitelistRole.findMany({
      where: {
        discordRoleId: {
          in: discordRoleIds
        }
      }
    });

    return mappedRoles.length > 0;
  }

  /**
   * Get all whitelist entries (alias for API compatibility)
   */
  async getAllWhitelistEntries(): Promise<any[]> {
    return this.getWhitelistUsers();
  }

  /**
   * Add user by VRChat User ID (alias for API compatibility)
   */
  async addUserByVrcUserId(vrcUserId: string): Promise<any> {
    const user = await this.getUserByVrcUserId(vrcUserId);
    if (!user) {
      throw new Error("User not found in database. User must be verified first.");
    }
    return await this.addUserByDiscordId(user.discordId);
  }

  /**
   * Assign role by VRChat User ID
   */
  async assignRoleByVrcUserId(vrcUserId: string, roleName: string, assignedBy?: string, expiresAt?: Date): Promise<any> {
    const user = await this.getUserByVrcUserId(vrcUserId);
    if (!user) {
      throw new Error("User not found in database");
    }
    return await this.assignRoleByDiscordId(user.discordId, roleName, assignedBy, expiresAt);
  }

  /**
   * Bulk import users from CSV content
   */
  async bulkImportUsers(csvContent: string): Promise<any> {
    const lines = csvContent.split('\n').filter(line => line.trim());
    const results = {
      imported: 0,
      errors: [] as string[]
    };

    for (const line of lines) {
      const [vrchatUsername, roleNames] = line.split(':');
      if (!vrchatUsername) continue;

      try {
        // Add user to whitelist
        await this.addUserByVrcUsername(vrchatUsername.trim());
        
        // Assign roles if specified
        if (roleNames) {
          const roles = roleNames.split(',').map(r => r.trim());
          for (const roleName of roles) {
            try {
              await this.assignRoleByDiscordId(vrchatUsername.trim(), roleName, 'Bulk Import');
            } catch (error) {
              // Ignore role assignment errors for now
            }
          }
        }
        
        results.imported++;
      } catch (error: any) {
        results.errors.push(`${vrchatUsername}: ${error.message}`);
      }
    }

    return results;
  }
}
