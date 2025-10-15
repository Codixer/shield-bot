import { getUserById } from "../../utility/vrchat.js";
import { purgeCloudflareCache } from "../../utility/cloudflare/purgeCache.js";
import { searchUsers } from "../../utility/vrchat/user.js";
import { prisma, bot } from "../../main.js";
import { sendWhitelistLog } from "../../utility/vrchat/whitelistLogger.js";

export class WhitelistManager {
  // Batching mechanism for GitHub updates
  private pendingUpdates: Set<string> = new Set();
  private updateTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_DELAY_MS = 5000; // Wait 5 seconds after last change before updating
  private lastPublishedContent: string | null = null;
  private _lastUpdateTimestamp: number | null = null;
  public get lastUpdateTimestamp(): number | null {
    return this._lastUpdateTimestamp;
  }

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
                role: true,
              },
            },
          },
        },
      },
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
            vrcUserId: vrcUserId,
          },
        },
      },
      include: {
        vrchatAccounts: true,
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
  }

  /**
   * Add a user to the whitelist by Discord ID
   */
  async addUserByDiscordId(discordId: string): Promise<any> {
    const user = await prisma.user.findUnique({ where: { discordId } });
    if (!user) {
      throw new Error(
        "User not found in the database. User must be verified first.",
      );
    }

    // Check if already whitelisted
    const existing = await prisma.whitelistEntry.findUnique({
      where: { userId: user.id },
    });

    if (existing) {
      throw new Error("User is already whitelisted.");
    }

    return await prisma.whitelistEntry.create({
      data: { userId: user.id },
      include: {
        user: {
          include: {
            vrchatAccounts: true,
          },
        },
      },
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
              vrcUserId: vrcUser.id,
            },
          },
        },
      });

      if (!user) {
        throw new Error(
          `User with VRChat account "${vrchatUsername}" not found in database. User must be verified first.`,
        );
      }

      return await this.addUserByDiscordId(user.discordId);
    } catch (error: any) {
      throw new Error(
        `Failed to add user by VRChat username: ${error.message}`,
      );
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
        where: { userId: user.id },
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
  async createRole(
    guildId: string,
    permissions?: string,
    discordRoleId?: string,
  ): Promise<any> {
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
    } catch (error) {
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
  ): Promise<any> {
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

      return await prisma.whitelistRoleAssignment.create({
        data: {
          whitelistId: whitelistEntry!.id,
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
      if (!user) return false;

      const role = await prisma.whitelistRole.findUnique({
        where: { id: roleId },
      });
      if (!role) return false;

      const result = await prisma.whitelistRoleAssignment.deleteMany({
        where: {
          whitelist: { userId: user.id },
          roleId: role.id,
        },
      });

      return result.count > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all users in the whitelist, optionally filtered by guild
   */
  async getWhitelistUsers(guildId?: string): Promise<any[]> {
    const entries = await prisma.whitelistEntry.findMany({
      include: {
        user: {
          include: {
            vrchatAccounts: true,
          },
        },
        roleAssignments: {
          include: {
            role: true,
          },
          where: {
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            ...(guildId && {
              role: {
                guildId,
              },
            }),
          },
        },
      },
    });

    const usersWithCurrentNames = [];

    for (const entry of entries) {
      // Get all VRChat accounts for this user (MAIN, ALT, UNVERIFIED only)
      const validAccounts =
        entry.user.vrchatAccounts?.filter(
          (acc) =>
            acc.accountType === "MAIN" ||
            acc.accountType === "ALT" ||
            acc.accountType === "UNVERIFIED",
        ) || [];

      if (validAccounts.length === 0) {
        continue; // Skip users without any valid VRChat accounts
      }

      // Get unique permissions from all roles (deduplicated)
      const allPermissions = new Set<string>();
      for (const assignment of entry.roleAssignments) {
        if (assignment.role.permissions) {
          // Split permissions by comma and add each one
          const permissions = assignment.role.permissions
            .split(",")
            .map((p: string) => p.trim());
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
            vrchatUsername =
              userInfo?.displayName ||
              userInfo?.username ||
              vrchatAccount.vrcUserId;

            // Update the cached username in the database
            if (vrchatUsername !== vrchatAccount.vrcUserId) {
              await prisma.vRChatAccount.update({
                where: { id: vrchatAccount.id },
                data: {
                  vrchatUsername,
                  usernameUpdatedAt: new Date(),
                },
              });
            }
          } catch (error) {
            console.warn(
              `Failed to fetch username for ${vrchatAccount.vrcUserId}:`,
              error,
            );
            vrchatUsername = vrchatAccount.vrcUserId; // Fallback to VRC user ID
          }
        }

        usersWithCurrentNames.push({
          discordId: entry.user.discordId,
          vrchatUsername,
          roles: Array.from(allPermissions), // These are the actual permissions (station, truavatar, etc.)
          roleNames: entry.roleAssignments.map(
            (assignment: any) => assignment.role.permissions,
          ), // These are the role names
          createdAt: entry.createdAt,
          accountType: vrchatAccount.accountType || "UNKNOWN",
          vrcUserId: vrchatAccount.vrcUserId,
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
        roleAssignments: true,
      },
    });
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<any> {
    const [
      totalUsers,
      totalRoles,
      totalActiveAssignments,
      totalExpiredAssignments,
    ] = await Promise.all([
      prisma.whitelistEntry.count(),
      prisma.whitelistRole.count(),
      prisma.whitelistRoleAssignment.count({
        where: {
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
      prisma.whitelistRoleAssignment.count({
        where: {
          expiresAt: { lte: new Date() },
        },
      }),
    ]);

    return {
      totalUsers,
      totalRoles,
      totalActiveAssignments,
      totalExpiredAssignments,
    };
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
   * Generate raw whitelist content, optionally filtered by guild
   */
  async generateWhitelistContent(guildId?: string): Promise<string> {
    const users = await this.getWhitelistUsers(guildId);

    if (users.length === 0) {
      return "";
    }

    return users
      .map((user) => {
        const roles = user.roles.join(":"); // Use colon separator for roles
        return `${user.vrchatUsername},${roles}`; // Use comma separator between username and roles
      })
      .join("\n");
  }

  /**
   * Generate encoded whitelist for PowerShell consumption, optionally filtered by guild
   */
  async generateEncodedWhitelist(guildId?: string): Promise<string> {
    const content = await this.generateWhitelistContent(guildId);
    return this.xorEncode(content);
  }

  /**
   * Publish the whitelist to the configured GitHub repository.
   * Writes both encoded and decoded files in a single commit.
   * Now checks if content changed before publishing to avoid unnecessary commits.
   */
  async publishWhitelist(commitMessage?: string, force: boolean = false, guildId?: string): Promise<any> {
    // Generate content to check if it changed
    const currentContent = await this.generateWhitelistContent();

    // Skip update if content hasn't changed (unless forced)
    if (!force && this.lastPublishedContent !== null && currentContent === this.lastPublishedContent) {
      console.log('[Whitelist] Content unchanged, skipping GitHub update');
      return { updated: false, reason: 'Content unchanged' };
    }

    const result = await this.updateRepositoryWithWhitelist(commitMessage);

    // Store the published content for future comparisons
    if (result.updated) {
      this.lastPublishedContent = currentContent;
      this._lastUpdateTimestamp = Date.now();
      // Purge Cloudflare cache for this guild's whitelist URLs
      const zoneId = process.env.CLOUDFLARE_ZONE_ID ?? "";
      const apiToken = process.env.CLOUDFLARE_API_TOKEN ?? "";
      
      if (zoneId && apiToken) {
        try {
          const targetGuildIds = guildId ? [guildId] : ["813926536457224212"];
          for (const gid of targetGuildIds) {
            const urls = [
              `https://api.vrcshield.com/api/vrchat/${gid}/whitelist/encoded`,
              `https://api.vrcshield.com/api/vrchat/${gid}/whitelist/raw`,
            ];
            await purgeCloudflareCache(zoneId, apiToken, urls);
            console.log(`[Whitelist] Purged Cloudflare cache for guild ${gid}`);
          }
        } catch (err) {
          console.warn(`[Whitelist] Cloudflare purge failed:`, err);
        }
      } else {
        console.log(`[Whitelist] Cloudflare cache purge skipped - missing zone ID or API token`);
      }
    }
    return result;
  }

  /**
   * Queue a user for batched whitelist update
   * This collects changes and publishes once after a delay
   */
  queueBatchedUpdate(discordId: string, commitMessage?: string): void {
    this.pendingUpdates.add(discordId);

    // Clear existing timer and start a new one
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    this.updateTimer = setTimeout(async () => {
      await this.processBatchedUpdates(commitMessage);
    }, this.BATCH_DELAY_MS);
  }

  /**
   * Process all pending batched updates
   */
  private async processBatchedUpdates(commitMessage?: string): Promise<void> {
    if (this.pendingUpdates.size === 0) {
      return;
    }

    const count = this.pendingUpdates.size;
    const users = Array.from(this.pendingUpdates);
    this.pendingUpdates.clear();
    this.updateTimer = null;

    console.log(`[Whitelist] Processing batched update for ${count} users`);

    try {
      // Generate a meaningful commit message if not provided
      let message = commitMessage;
      if (!message || message.trim().length === 0) {
        if (count === 1) {
          // Try to get the user's name for single updates
          try {
            const user = await this.getUserByDiscordId(users[0]);
            const name = user?.vrchatAccounts?.[0]?.vrchatUsername || users[0];
            message = `Updated whitelist for ${name}`;
          } catch {
            message = `Updated whitelist for 1 user`;
          }
        } else {
          message = `Updated whitelist for ${count} users`;
        }
      }

      // Publish with content change check
      // If you have a way to determine the guildId for the batch, pass it here
      await this.publishWhitelist(message, false);
    } catch (error) {
      console.error('[Whitelist] Error processing batched updates:', error);
    }
  }

  /**
   * XOR encode the content using the configured key (matching PowerShell script)
   */
  private xorEncode(content: string): string {
    const xorKey =
      process.env.WHITELIST_XOR_KEY || "SHIELD_WHITELIST_KEY_9302025";

    // Normalize line endings to LF only (\n), but KEEP them
    const normalizedContent = content.replace(/\r\n/g, "\n").trim();

    // Calculate checksum (over the UTF-8 bytes of the full text including newlines)
    const contentBytesForChecksum = Buffer.from(normalizedContent, "utf8");
    let checksum = 0;
    for (const byte of contentBytesForChecksum) {
      checksum += byte;
    }

    const contentWithChecksum = `${normalizedContent}|${checksum}`;

    // Convert to UTF-8 bytes
    const contentBytes = Buffer.from(contentWithChecksum, "utf8");
    const keyBytes = Buffer.from(xorKey, "utf8");

    if (keyBytes.length === 0) {
      throw new Error("XOR key cannot be empty");
    }

    // XOR encryption
    const xoredBytes = Buffer.alloc(contentBytes.length);
    for (let i = 0; i < contentBytes.length; i++) {
      xoredBytes[i] = contentBytes[i] ^ keyBytes[i % keyBytes.length];
    }

    // Base64 encode
    return xoredBytes.toString("base64");
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
  private async updateRepositoryWithWhitelist(
    commitMessage?: string,
  ): Promise<any> {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_REPO_OWNER;
    const repo = process.env.GITHUB_REPO_NAME;
    const branch = process.env.GITHUB_REPO_BRANCH || "main";
    const encodedFilePath =
      process.env.GITHUB_REPO_ENCODED_FILE_PATH || "whitelist.encoded.txt";
    const decodedFilePath =
      process.env.GITHUB_REPO_DECODED_FILE_PATH || "whitelist.txt";

    if (!token)
      throw new Error("GITHUB_TOKEN environment variable is required");
    if (!owner)
      throw new Error("GITHUB_REPO_OWNER environment variable is required");
    if (!repo)
      throw new Error("GITHUB_REPO_NAME environment variable is required");

    const apiBase = `https://api.github.com`;

    const gh = async (path: string, init?: RequestInit) => {
      const res = await fetch(`${apiBase}${path}`, {
        ...init,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          ...(init?.headers || {}),
        },
      } as RequestInit);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `GitHub API error ${res.status} ${res.statusText}: ${text}`,
        );
      }
      return res.json();
    };

    // Prepare content
    const [encodedData, decodedData] = await Promise.all([
      this.generateEncodedWhitelist(),
      this.generateWhitelistContent(),
    ]);

    // Step 1: Get latest commit on branch
    const ref = await gh(`/repos/${owner}/${repo}/git/refs/heads/${branch}`);
    const latestCommitSha = ref?.object?.sha;
    if (!latestCommitSha)
      throw new Error("Failed to resolve latest commit sha");

    // Step 2: Get base tree of that commit
    const latestCommit = await gh(
      `/repos/${owner}/${repo}/git/commits/${latestCommitSha}`,
    );
    const baseTreeSha = latestCommit?.tree?.sha;
    if (!baseTreeSha) throw new Error("Failed to resolve base tree sha");

    // Step 3: Create blobs for both files
    const [encodedBlob, decodedBlob] = await Promise.all([
      gh(`/repos/${owner}/${repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: encodedData, encoding: "utf-8" }),
      }),
      gh(`/repos/${owner}/${repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: decodedData, encoding: "utf-8" }),
      }),
    ]);
    const encodedBlobSha = encodedBlob?.sha;
    const decodedBlobSha = decodedBlob?.sha;
    if (!encodedBlobSha || !decodedBlobSha)
      throw new Error("Failed to create blobs for whitelist files");

    // Step 4: Create a new tree with both updated files
    const newTree = await gh(`/repos/${owner}/${repo}/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: [
          {
            path: encodedFilePath,
            mode: "100644",
            type: "blob",
            sha: encodedBlobSha,
          },
          {
            path: decodedFilePath,
            mode: "100644",
            type: "blob",
            sha: decodedBlobSha,
          },
        ],
      }),
    });
    const newTreeSha = newTree?.sha;
    if (!newTreeSha) throw new Error("Failed to create new tree");

    // Step 5: Create a new commit (optionally PGP-signed)
    const message =
      commitMessage?.trim() && commitMessage.length > 0
        ? commitMessage
        : `chore(whitelist): update encoded (${encodedFilePath}) and decoded (${decodedFilePath}) at ${new Date().toISOString()}`;

    // Optional author/committer and PGP signature support
    const signEnabled =
      String(process.env.GIT_SIGN_COMMITS || "").toLowerCase() === "true";
    const authorName = process.env.GIT_AUTHOR_NAME || undefined;
    const authorEmail = process.env.GIT_AUTHOR_EMAIL || undefined;
    const committerName = process.env.GIT_COMMITTER_NAME || authorName;
    const committerEmail = process.env.GIT_COMMITTER_EMAIL || authorEmail;
    const nowIso = new Date().toISOString();

    const author =
      authorName && authorEmail
        ? { name: authorName, email: authorEmail, date: nowIso }
        : undefined;
    const committer =
      committerName && committerEmail
        ? { name: committerName, email: committerEmail, date: nowIso }
        : undefined;

    let signature: string | undefined = undefined;

    if (signEnabled) {
      try {
        const privateKeyArmored = process.env.GIT_PGP_PRIVATE_KEY;
        const passphrase = process.env.GIT_PGP_PASSPHRASE || "";
        if (!privateKeyArmored) {
          throw new Error(
            "GIT_SIGN_COMMITS is true but GIT_PGP_PRIVATE_KEY is not set",
          );
        }
        if (!author || !committer) {
          throw new Error(
            "GIT_SIGN_COMMITS is true but author/committer identity env vars are missing",
          );
        }

        // Build raw commit payload matching what GitHub expects for signing
        const payload = this.buildRawCommitPayload({
          treeSha: newTreeSha,
          parentSha: latestCommitSha,
          author: author,
          committer: committer,
          message,
        });

        // Dynamic import to avoid cost if not signing
        const openpgp = await import("openpgp");
        const privateKey = await openpgp.readPrivateKey({
          armoredKey: privateKeyArmored,
        });
        const decryptedKey = passphrase
          ? await openpgp.decryptKey({ privateKey, passphrase })
          : privateKey;
        const signed = await openpgp.sign({
          message: await openpgp.createMessage({ text: payload }),
          signingKeys: decryptedKey,
          detached: true,
          format: "armored",
        } as any);
        signature = typeof signed === "string" ? signed : undefined;
      } catch (e) {
        console.warn(
          "[Whitelist] Failed to sign commit, falling back to unsigned commit:",
          e,
        );
      }
    }

    const commitBody: any = {
      message,
      tree: newTreeSha,
      parents: [latestCommitSha],
    };
    if (author) commitBody.author = author;
    if (committer) commitBody.committer = committer;
    if (signature) commitBody.signature = signature;

    const newCommit = await gh(`/repos/${owner}/${repo}/git/commits`, {
      method: "POST",
      body: JSON.stringify(commitBody),
    });
    const newCommitSha = newCommit?.sha;
    if (!newCommitSha) throw new Error("Failed to create new commit");

    // Step 6: Update branch reference
    await gh(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: newCommitSha, force: false }),
    });

    return {
      updated: true,
      commitSha: newCommitSha,
      paths: [encodedFilePath, decodedFilePath],
      branch,
    };
  }

  /**
   * Build the raw commit payload used for PGP signing.
   * Format:
   *   tree <treeSha>\n
   *   parent <parentSha>\n
   *   author Name <email> <unixSeconds> +0000\n
   *   committer Name <email> <unixSeconds> +0000\n
   *   \n
   *   <message>\n
   */
  private buildRawCommitPayload(input: {
    treeSha: string;
    parentSha: string;
    author: { name: string; email: string; date: string };
    committer: { name: string; email: string; date: string };
    message: string;
  }): string {
    const toUnixAndTz = (iso: string) => {
      const d = new Date(iso);
      const unix = Math.floor(d.getTime() / 1000);
      // Use UTC to avoid host-dependent offsets; ensures JSON date and payload align
      const tz = "+0000";
      return `${unix} ${tz}`;
    };

    const authorLine = `author ${input.author.name} <${input.author.email}> ${toUnixAndTz(input.author.date)}`;
    const committerLine = `committer ${input.committer.name} <${input.committer.email}> ${toUnixAndTz(input.committer.date)}`;

    const lines = [
      `tree ${input.treeSha}`,
      `parent ${input.parentSha}`,
      authorLine,
      committerLine,
      "",
      input.message,
      "",
    ];
    return lines.join("\n");
  }

  /**
   * Sync user roles from Discord
   */
  async syncUserRolesFromDiscord(
    discordId: string,
    discordRoleIds: string[],
    guildId?: string,
  ): Promise<void> {
    // Ensure user exists in database first
    const user = await prisma.user.findUnique({ 
      where: { discordId },
      include: {
        vrchatAccounts: true,
      },
    });
    
    if (!user) {
      console.log(
        `[Whitelist] User ${discordId} not found in database, skipping sync`,
      );
      return;
    }

    // Check if user has any verified VRChat accounts (MAIN or ALT)
    const hasVerifiedAccount = user.vrchatAccounts?.some(
      (acc) => acc.accountType === "MAIN" || acc.accountType === "ALT"
    ) ?? false;

    if (!hasVerifiedAccount) {
      // User is not verified, remove from whitelist if present
      await this.removeUserFromWhitelistIfNoRoles(discordId);
      console.log(
        `[Whitelist] User ${discordId} has no verified VRChat accounts - removed from whitelist`,
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
      validMappedRoles = mappedRoles.filter(role => role.guildId === guildId);
      
      if (validMappedRoles.length < mappedRoles.length) {
        const invalidCount = mappedRoles.length - validMappedRoles.length;
        console.log(
          `[Whitelist] User ${discordId} has ${invalidCount} role(s) from other guilds - filtering them out`,
        );
      }
    }

    if (validMappedRoles.length === 0) {
      // User has no qualifying roles, remove from whitelist if present
      await this.removeUserFromWhitelistIfNoRoles(discordId);
      console.log(
        `[Whitelist] User ${discordId} has no qualifying Discord roles - removed from whitelist`,
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
    const existingAssignments = whitelistEntry!.roleAssignments || [];
    const existingRoleIds = new Set(existingAssignments.map((a) => a.roleId));
    const newRoleIds = new Set(validMappedRoles.map((r) => r.id));

    // Remove assignments that are no longer valid (role no longer mapped to Discord roles)
    const assignmentsToRemove = existingAssignments.filter(
      (a) => !newRoleIds.has(a.roleId),
    );
    for (const assignment of assignmentsToRemove) {
      await prisma.whitelistRoleAssignment.delete({
        where: { id: assignment.id },
      });
    }

    // Add new role assignments for mapped roles that don't exist yet
    const rolesToAdd = validMappedRoles.filter((r) => !existingRoleIds.has(r.id));
    for (const role of rolesToAdd) {
      await prisma.whitelistRoleAssignment.create({
        data: {
          whitelistId: whitelistEntry!.id,
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

    console.log(
      `[Whitelist] User ${discordId} synced with ${validMappedRoles.length} role(s) and permissions: [${Array.from(allPermissions).join(", ")}]`,
    );
  }

  /**
   * Ensure unverified accounts get basic whitelist access
   */
  async ensureUnverifiedAccountAccess(discordId: string): Promise<void> {
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

    console.log(
      `[Whitelist] Granted basic access to unverified account for user ${discordId}`,
    );

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
        console.log(
          `[Whitelist] Discord user ${discordId} not found in any guild; skipping full sync`,
        );
        return;
      }

      const roleIds: string[] = member.roles.cache.map((role: any) => role.id);
      if (!roleIds.length) {
        console.log(
          `[Whitelist] Discord user ${discordId} has no roles; skipping full sync`,
        );
        return;
      }

      // Check for eligible mapped roles
      const mappings = await this.getDiscordRoleMappings();
      const eligible = mappings.filter(
        (m) => m.discordRoleId && roleIds.includes(m.discordRoleId),
      );
      if (eligible.length === 0) {
        console.log(
          `[Whitelist] Discord user ${discordId} has no eligible mapped roles; skipping full sync`,
        );
        return;
      }

      // Perform full sync and publish
      await this.syncAndPublishAfterVerification(discordId);
    } catch (e) {
      console.warn(
        `[Whitelist] Failed to perform full sync for unverified user ${discordId}:`,
        e,
      );
    }
  }

  /**
   * Remove user from whitelist if they have no qualifying roles
   * This function ensures complete removal of whitelist access
   */
  async removeUserFromWhitelistIfNoRoles(discordId: string): Promise<void> {
    const user = await this.getUserByDiscordId(discordId);
    if (!user || !user.whitelistEntry) {
      console.log(
        `[Whitelist] User ${discordId} not found or has no whitelist entry - nothing to remove`,
      );
      return;
    }

    // Get current role assignments for logging
    const currentAssignments = user.whitelistEntry.roleAssignments || [];
    const roleIds = currentAssignments.map(
      (assignment) => assignment.role.discordRoleId || assignment.role.id,
    );

    // Remove whitelist entry (this will cascade delete role assignments)
    await prisma.whitelistEntry.delete({
      where: { userId: user.id },
    });

    console.log(
      `[Whitelist] Removed user ${discordId} from whitelist - had roles: [${roleIds.join(", ")}]`,
    );
  }

  /**
   * Setup Discord role mapping
   */
  async setupDiscordRoleMapping(
    discordRoleId: string,
    guildId: string,
    permissions: string[],
  ): Promise<any> {
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
  async getDiscordRoleMappings(guildId?: string): Promise<any[]> {
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
      throw new Error(
        "User not found in database. User must be verified first.",
      );
    }
    return await this.addUserByDiscordId(user.discordId);
  }

  /**
   * Assign role by VRChat User ID
   */
  async assignRoleByVrcUserId(
    vrcUserId: string,
    roleId: number,
    assignedBy?: string,
    expiresAt?: Date,
  ): Promise<any> {
    const user = await this.getUserByVrcUserId(vrcUserId);
    if (!user) {
      throw new Error("User not found in database");
    }
    return await this.assignRoleByDiscordId(
      user.discordId,
      roleId,
      assignedBy,
      expiresAt,
    );
  }

  /**
   * Bulk import users from CSV content
   */
  async bulkImportUsers(csvContent: string): Promise<any> {
    const lines = csvContent.split("\n").filter((line) => line.trim());
    const results = {
      imported: 0,
      errors: [] as string[],
    };

    for (const line of lines) {
      const [vrchatUsername, roleNames] = line.split(":");
      if (!vrchatUsername) continue;

      try {
        // Add user to whitelist
        await this.addUserByVrcUsername(vrchatUsername.trim());

        // Assign roles if specified
        if (roleNames) {
          const roles = roleNames.split(",").map((r) => r.trim());
          for (const roleName of roles) {
            try {
              // Note: This needs to be updated to use roleId instead of roleName
              // TODO: Look up role by Discord role ID or other identifier
              // await this.assignRoleByDiscordId(
              //   vrchatUsername.trim(),
              //   roleId,
              //   "Bulk Import",
              // );
              console.warn(`[Bulk Import] Role assignment by name is deprecated: ${roleName}`);
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
  async syncAndPublishAfterVerification(
    discordId: string,
    botOverride?: any,
  ): Promise<void> {
    const activeBot = botOverride ?? bot;
    const guildManager = activeBot?.guilds;
    if (!guildManager) {
      console.warn(
        `[Whitelist] Discord client unavailable; skipping whitelist sync for ${discordId}`,
      );
      return;
    }
    const fallbackGuildId = "813926536457224212";
    try {
      // Find the Discord member across guilds
      let member: any = null;
      if (guildManager.cache) {
        for (const guild of guildManager.cache.values()) {
          try {
            member = await guild.members.fetch(discordId);
            if (member) break;
          } catch {
            // Not in this guild; continue searching
          }
        }
      }

      // Fallback: explicitly fetch the primary guild if member still not found
      if (!member) {
        try {
          const fallbackGuild = await guildManager.fetch(fallbackGuildId);
          if (fallbackGuild) {
            try {
              member = await fallbackGuild.members.fetch(discordId);
            } catch {
              // Member not in fallback guild
            }
          }
        } catch (fetchError) {
          console.warn(
            `[Whitelist] Failed to fetch fallback guild ${fallbackGuildId}:`,
            fetchError,
          );
        }
      }

      if (!member) {
        console.log(
          `[Whitelist] Discord user ${discordId} not found in any guild; skipping whitelist sync`,
        );
        return;
      }

      const roleIds: string[] = member.roles.cache.map((role: any) => role.id);
      if (!roleIds.length) {
        console.log(
          `[Whitelist] Discord user ${discordId} has no roles; skipping whitelist sync`,
        );
        return;
      }

      // Determine if user has eligible mapped roles and collect permissions for commit message
      const mappings = await this.getDiscordRoleMappings();
      const eligible = mappings.filter(
        (m) => m.discordRoleId && roleIds.includes(m.discordRoleId),
      );
      if (eligible.length === 0) {
        console.log(
          `[Whitelist] Discord user ${discordId} has no eligible mapped roles; skipping whitelist sync`,
        );
        return;
      }

      // Sync whitelist role assignments
      await this.syncUserRolesFromDiscord(discordId, roleIds, member.guild.id);

      // Get VRChat account info and whitelist roles for logging
      const vrchatInfo = await this.getUserByDiscordId(discordId);
      const whitelistRoles = await this.getUserWhitelistRoles(discordId);

      // Build permissions list from mapping permissions
      const permSet = new Set<string>();
      for (const m of eligible) {
        if (m.permissions) {
          for (const p of String(m.permissions)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean))
            permSet.add(p);
        }
      }
      const permissions = Array.from(permSet).sort();
      const who = member.displayName || member.user?.username || discordId;
      const msg = `${who} was added with the roles ${permissions.length ? permissions.join(", ") : "none"}`;

      // Note: Whitelist logging is handled by the specific callers (verification handlers, account managers)
      // to ensure the correct context and action type (verified/removed) is logged

      // Queue batched update instead of immediate publish
      this.queueBatchedUpdate(discordId, msg);
      console.log(
        `[Whitelist] Queued repository update after verification for ${who}`,
      );
    } catch (e) {
      console.warn(
        `[Whitelist] Failed to sync/publish whitelist for verified user ${discordId}:`,
        e,
      );
    }
  }

  /**
   * Get user's whitelist roles
   */
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
        `[Whitelist] Failed to get whitelist roles for ${discordId}:`,
        error,
      );
      return [];
    }
  }
}

// Export instance
export const whitelistManager = new WhitelistManager();
