import { getUserById } from '../../utility/vrchat.js';
import { searchUsers } from '../../utility/vrchat/user.js';
import { prisma, bot } from "../../main.js";

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
      // Get all VRChat accounts for this user (MAIN, ALT, UNVERIFIED, and IN_VERIFICATION)
      const validAccounts = entry.user.vrchatAccounts?.filter(acc => 
        acc.accountType === 'MAIN' || acc.accountType === 'ALT' || acc.accountType === 'UNVERIFIED' || acc.accountType === 'IN_VERIFICATION'
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
        let vrchatUsername = vrchatAccount.vrchatUsername;
        
        // If we don't have a cached username or it's outdated, try to fetch from VRChat API
        if (!vrchatUsername || vrchatUsername === vrchatAccount.vrcUserId) {
      try {
        const userInfo = await getUserById(vrchatAccount.vrcUserId);
            vrchatUsername = userInfo?.displayName || userInfo?.username || vrchatAccount.vrcUserId;
            
            // Update the cached username in the database
            if (vrchatUsername !== vrchatAccount.vrcUserId) {
              await prisma.vRChatAccount.update({
                where: { id: vrchatAccount.id },
                data: { 
                  vrchatUsername,
                  usernameUpdatedAt: new Date()
                }
              });
            }
          } catch (error) {
            console.warn(`Failed to fetch username for ${vrchatAccount.vrcUserId}:`, error);
            vrchatUsername = vrchatAccount.vrcUserId; // Fallback to VRC user ID
          }
        }
        
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
   * Publish the whitelist to the configured GitHub repository.
   * Writes both encoded and decoded files in a single commit.
   */
  async publishWhitelist(commitMessage?: string): Promise<any> {
    return await this.updateRepositoryWithWhitelist(commitMessage);
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
   * Update a GitHub repository with BOTH encoded and decoded whitelist files in a single commit.
   * Uses the low-level Git data API per the provided guide.
   * Required env vars: GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME
   * Optional env vars:
   *   - GITHUB_REPO_BRANCH (default: 'main')
   *   - GITHUB_REPO_ENCODED_FILE_PATH (default: 'whitelist.encoded.txt')
   *   - GITHUB_REPO_DECODED_FILE_PATH (default: 'whitelist.txt')
   */
  private async updateRepositoryWithWhitelist(commitMessage?: string): Promise<any> {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_REPO_OWNER;
    const repo = process.env.GITHUB_REPO_NAME;
    const branch = process.env.GITHUB_REPO_BRANCH || 'main';
  const encodedFilePath = process.env.GITHUB_REPO_ENCODED_FILE_PATH || 'whitelist.encoded.txt';
    const decodedFilePath = process.env.GITHUB_REPO_DECODED_FILE_PATH || 'whitelist.txt';

    if (!token) throw new Error('GITHUB_TOKEN environment variable is required');
    if (!owner) throw new Error('GITHUB_REPO_OWNER environment variable is required');
    if (!repo) throw new Error('GITHUB_REPO_NAME environment variable is required');

    const apiBase = `https://api.github.com`;

    const gh = async (path: string, init?: RequestInit) => {
      const res = await fetch(`${apiBase}${path}`, {
        ...init,
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          ...(init?.headers || {})
        }
      } as RequestInit);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`GitHub API error ${res.status} ${res.statusText}: ${text}`);
      }
      return res.json();
    };

    // Prepare content
    const [encodedData, decodedData] = await Promise.all([
      this.generateEncodedWhitelist(),
      this.generateWhitelistContent()
    ]);

    // Step 1: Get latest commit on branch
  const ref = await gh(`/repos/${owner}/${repo}/git/refs/heads/${branch}`);
    const latestCommitSha = ref?.object?.sha;
    if (!latestCommitSha) throw new Error('Failed to resolve latest commit sha');

    // Step 2: Get base tree of that commit
    const latestCommit = await gh(`/repos/${owner}/${repo}/git/commits/${latestCommitSha}`);
    const baseTreeSha = latestCommit?.tree?.sha;
    if (!baseTreeSha) throw new Error('Failed to resolve base tree sha');

    // Step 3: Create blobs for both files
    const [encodedBlob, decodedBlob] = await Promise.all([
      gh(`/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: encodedData, encoding: 'utf-8' })
      }),
      gh(`/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: decodedData, encoding: 'utf-8' })
      })
    ]);
    const encodedBlobSha = encodedBlob?.sha;
    const decodedBlobSha = decodedBlob?.sha;
    if (!encodedBlobSha || !decodedBlobSha) throw new Error('Failed to create blobs for whitelist files');

    // Step 4: Create a new tree with both updated files
    const newTree = await gh(`/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: [
          {
            path: encodedFilePath,
            mode: '100644',
            type: 'blob',
            sha: encodedBlobSha
          },
          {
            path: decodedFilePath,
            mode: '100644',
            type: 'blob',
            sha: decodedBlobSha
          }
        ]
      })
    });
    const newTreeSha = newTree?.sha;
    if (!newTreeSha) throw new Error('Failed to create new tree');

    // Step 5: Create a new commit
    const message = commitMessage?.trim() && commitMessage.length > 0
      ? commitMessage
      : `chore(whitelist): update encoded (${encodedFilePath}) and decoded (${decodedFilePath}) at ${new Date().toISOString()}`;
    const newCommit = await gh(`/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: newTreeSha,
        parents: [latestCommitSha]
      })
    });
    const newCommitSha = newCommit?.sha;
    if (!newCommitSha) throw new Error('Failed to create new commit');

    // Step 6: Update branch reference
  await gh(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommitSha, force: false })
    });

  return { updated: true, commitSha: newCommitSha, paths: [encodedFilePath, decodedFilePath], branch };
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
      console.log(`[Whitelist] User ${discordId} has no qualifying Discord roles - removed from whitelist`);
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

    // Remove ALL existing role assignments for this user to ensure clean state
    await prisma.whitelistRoleAssignment.deleteMany({
      where: {
        whitelistId: whitelistEntry!.id
      }
    });

    // Add new role assignments for mapped roles
    for (const role of mappedRoles) {
      await prisma.whitelistRoleAssignment.create({
        data: {
          whitelistId: whitelistEntry!.id,
          roleId: role.id,
          assignedBy: 'Discord Role Sync'
        }
      });
    }

    console.log(`[Whitelist] User ${discordId} synced with roles: [${mappedRoles.map(r => r.name).join(', ')}]`);
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

    // Check if user has unverified or in-verification accounts
    const hasUnverifiedOrInVerificationAccount = user.vrchatAccounts.some(acc => 
      acc.accountType === 'UNVERIFIED' || acc.accountType === 'IN_VERIFICATION'
    );
    
    if (!hasUnverifiedOrInVerificationAccount) {
      return; // No unverified or in-verification accounts
    }

    // Ensure user has whitelist entry for basic access
    await prisma.whitelistEntry.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id }
    });

    console.log(`[Whitelist] Granted basic access to unverified/in-verification account for user ${discordId}`);

    // Now check if user has eligible Discord roles for full sync and publish
    try {
  let member: any = null;
      for (const guild of bot.guilds.cache.values()) {
        try {
          member = await guild.members.fetch(discordId);
          if (member) break;
        } catch {
          // Not in this guild; continue searching
        }
      }

      if (!member) {
        console.log(`[Whitelist] Discord user ${discordId} not found in any guild; skipping full sync`);
        return;
      }

      const roleIds: string[] = member.roles.cache.map((role: any) => role.id);
      if (!roleIds.length) {
        console.log(`[Whitelist] Discord user ${discordId} has no roles; skipping full sync`);
        return;
      }

      // Check for eligible mapped roles
      const mappings = await this.getDiscordRoleMappings();
      const eligible = mappings.filter(m => m.discordRoleId && roleIds.includes(m.discordRoleId));
      if (eligible.length === 0) {
        console.log(`[Whitelist] Discord user ${discordId} has no eligible mapped roles; skipping full sync`);
        return;
      }

      // Perform full sync and publish
      await this.syncAndPublishAfterVerification(discordId);
    } catch (e) {
      console.warn(`[Whitelist] Failed to perform full sync for unverified user ${discordId}:`, e);
    }
  }

  /**
   * Remove user from whitelist if they have no qualifying roles
   * This function ensures complete removal of whitelist access
   */
  async removeUserFromWhitelistIfNoRoles(discordId: string): Promise<void> {
    const user = await this.getUserByDiscordId(discordId);
    if (!user || !user.whitelistEntry) {
      console.log(`[Whitelist] User ${discordId} not found or has no whitelist entry - nothing to remove`);
      return;
    }

    // Get current role assignments for logging
    const currentAssignments = user.whitelistEntry.roleAssignments || [];
    const roleNames = currentAssignments.map(assignment => assignment.role.name);

    // Remove whitelist entry (this will cascade delete role assignments)
    await prisma.whitelistEntry.delete({
      where: { userId: user.id }
    });

    console.log(`[Whitelist] Removed user ${discordId} from whitelist - had roles: [${roleNames.join(', ')}]`);
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

  /**
   * Sync whitelist roles and publish after user verification
   */
  async syncAndPublishAfterVerification(discordId: string, bot?: any): Promise<void> {
    if (!bot) {
  // bot is available via static import
    }
    try {
      // Find the Discord member across guilds
      let member: any = null;
      for (const guild of bot.guilds.cache.values()) {
        try {
          member = await guild.members.fetch(discordId);
          if (member) break;
        } catch {
          // Not in this guild; continue searching
        }
      }

      if (!member) {
        console.log(`[Whitelist] Discord user ${discordId} not found in any guild; skipping whitelist sync`);
        return;
      }

      const roleIds: string[] = member.roles.cache.map((role: any) => role.id);
      if (!roleIds.length) {
        console.log(`[Whitelist] Discord user ${discordId} has no roles; skipping whitelist sync`);
        return;
      }

      // Determine if user has eligible mapped roles and collect permissions for commit message
      const mappings = await this.getDiscordRoleMappings();
      const eligible = mappings.filter(m => m.discordRoleId && roleIds.includes(m.discordRoleId));
      if (eligible.length === 0) {
        console.log(`[Whitelist] Discord user ${discordId} has no eligible mapped roles; skipping whitelist sync`);
        return;
      }

      // Sync whitelist role assignments
      await this.syncUserRolesFromDiscord(discordId, roleIds);

      // Build permissions list from mapping descriptions
      const permSet = new Set<string>();
      for (const m of eligible) {
        if (m.description) {
          for (const p of String(m.description).split(',').map(s => s.trim()).filter(Boolean)) permSet.add(p);
        }
      }
      const permissions = Array.from(permSet).sort();
      const who = member.displayName || member.user?.username || discordId;
      const msg = `${who} was added with the roles ${permissions.length ? permissions.join(', ') : 'none'}`;

      // Publish updated whitelist to the repository
      await this.publishWhitelist(msg);
      console.log(`[Whitelist] Repository updated after verification for ${who}`);
    } catch (e) {
      console.warn(`[Whitelist] Failed to sync/publish whitelist for verified user ${discordId}:`, e);
    }
  }
}

// Export instance
export const whitelistManager = new WhitelistManager();
