import { prisma } from "../../main.js";

/**
 * GitHub publishing operations for whitelist
 */
export class GitHubPublisher {
  /**
   * Update a GitHub repository with BOTH encoded and decoded whitelist files in a single commit.
   * Uses the low-level Git data API per the provided guide.
   * Required env vars: GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME
   * Optional env vars:
   *   - GITHUB_REPO_BRANCH (default: 'main')
   *   - GITHUB_REPO_ENCODED_FILE_PATH (default: 'whitelist.encoded.txt')
   *   - GITHUB_REPO_DECODED_FILE_PATH (default: 'whitelist.txt')
   */
  async updateRepositoryWithWhitelist(
    encodedData: string,
    decodedData: string,
    commitMessage?: string,
  ): Promise<{
    updated: boolean;
    commitSha?: string;
    paths?: string[];
    branch?: string;
  }> {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_REPO_OWNER;
    const repo = process.env.GITHUB_REPO_NAME;
    const branch = process.env.GITHUB_REPO_BRANCH || "main";
    const encodedFilePath =
      process.env.GITHUB_REPO_ENCODED_FILE_PATH || "whitelist.encoded.txt";
    const decodedFilePath =
      process.env.GITHUB_REPO_DECODED_FILE_PATH || "whitelist.txt";

    if (!token)
      {throw new Error("GITHUB_TOKEN environment variable is required");}
    if (!owner)
      {throw new Error("GITHUB_REPO_OWNER environment variable is required");}
    if (!repo)
      {throw new Error("GITHUB_REPO_NAME environment variable is required");}

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

    // Step 1: Get latest commit on branch
    const ref = await gh(`/repos/${owner}/${repo}/git/refs/heads/${branch}`);
    const latestCommitSha = (ref as { object?: { sha?: string } })?.object?.sha;
    if (!latestCommitSha)
      {throw new Error("Failed to resolve latest commit sha");}

    // Step 2: Get base tree of that commit
    const latestCommit = await gh(
      `/repos/${owner}/${repo}/git/commits/${latestCommitSha}`,
    );
    const baseTreeSha = (latestCommit as { tree?: { sha?: string } })?.tree?.sha;
    if (!baseTreeSha) {throw new Error("Failed to resolve base tree sha");}

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
    const encodedBlobSha = (encodedBlob as { sha?: string })?.sha;
    const decodedBlobSha = (decodedBlob as { sha?: string })?.sha;
    if (!encodedBlobSha || !decodedBlobSha)
      {throw new Error("Failed to create blobs for whitelist files");}

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
    const newTreeSha = (newTree as { sha?: string })?.sha;
    if (!newTreeSha) {throw new Error("Failed to create new tree");}

    // Step 5: Create a new commit
    const message =
      commitMessage?.trim() && commitMessage.length > 0
        ? commitMessage
        : `chore(whitelist): update encoded (${encodedFilePath}) and decoded (${decodedFilePath}) at ${new Date().toISOString()}`;

    // Optional author/committer identity
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

    const commitBody: {
      message: string;
      tree: string;
      parents: string[];
      author?: { name: string; email: string; date: string };
      committer?: { name: string; email: string; date: string };
    } = {
      message,
      tree: newTreeSha,
      parents: [latestCommitSha],
    };
    if (author) {
      commitBody.author = author;
    }
    if (committer) {
      commitBody.committer = committer;
    }

    const newCommit = await gh(`/repos/${owner}/${repo}/git/commits`, {
      method: "POST",
      body: JSON.stringify(commitBody),
    });
    const newCommitSha = (newCommit as { sha?: string })?.sha;
    if (!newCommitSha) {throw new Error("Failed to create new commit");}

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
   * Get usernames with a specific permission from the whitelist
   * Returns plain text with one username per line
   */
  private async getUsersByPermission(permission: string): Promise<string> {
    try {
      const entries = await prisma.whitelistEntry.findMany({
        select: {
          user: {
            select: {
              vrchatAccounts: {
                where: {
                  accountType: {
                    in: ["MAIN", "ALT", "UNVERIFIED"],
                  },
                },
                select: {
                  vrchatUsername: true,
                  accountType: true,
                },
              },
            },
          },
          roleAssignments: {
            where: {
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            select: {
              role: {
                select: {
                  permissions: true,
                },
              },
            },
          },
        },
      });

      const usernames = new Set<string>();

      for (const entry of entries) {
        // Check if user has the requested permission
        let hasPermission = false;
        for (const assignment of entry.roleAssignments) {
          if (assignment.role.permissions) {
            const permissions = assignment.role.permissions
              .split(",")
              .map((p: string) => p.trim());
            if (permissions.includes(permission)) {
              hasPermission = true;
              break;
            }
          }
        }

        if (hasPermission && entry.user.vrchatAccounts && entry.user.vrchatAccounts.length > 0) {
          // Prefer MAIN account, then ALT, then UNVERIFIED
          const accountTypes = ["MAIN", "ALT", "UNVERIFIED"];
          let selectedAccount = null;
          for (const accountType of accountTypes) {
            selectedAccount = entry.user.vrchatAccounts.find(
              (acc) => acc.accountType === accountType,
            );
            if (selectedAccount) {
              break;
            }
          }
          // Fallback to first account if no match found
          if (!selectedAccount) {
            selectedAccount = entry.user.vrchatAccounts[0];
          }
          if (selectedAccount?.vrchatUsername) {
            usernames.add(selectedAccount.vrchatUsername);
          }
        }
      }

      return Array.from(usernames).sort().join("\n");
    } catch (error) {
      console.error(`Error getting users by permission ${permission}:`, error);
      return "";
    }
  }

  /**
   * Generate all rooftop files content
   */
  async generateRooftopFiles(): Promise<{
    announcement: string;
    bouncer: string;
    staff: string;
    vip: string;
    vipplus: string;
    announcements: string;
    spinthebottle: string;
  }> {
    const [announcement, bouncer, staff, vip, vipplus, announcements, spinthebottle] =
      await Promise.all([
        this.getUsersByPermission("rooftop_announce"),
        this.getUsersByPermission("rooftop_bouncer"),
        this.getUsersByPermission("rooftop_staff"),
        this.getUsersByPermission("rooftop_vip"),
        this.getUsersByPermission("rooftop_vipplus"),
        (async () => {
          try {
            const announcements = await prisma.announcement.findMany({
              orderBy: {
                createdAt: "asc",
              },
              select: {
                content: true,
              },
            });
            return announcements.map((announcement) => announcement.content).join("\n");
          } catch (error) {
            console.error("Error getting announcements:", error);
            return "";
          }
        })(),
        (async () => {
          try {
            const responses = await prisma.spinTheBottleResponse.findMany({
              orderBy: {
                createdAt: "asc",
              },
              select: {
                content: true,
              },
            });
            return responses.map((response) => response.content).join("\n");
          } catch (error) {
            console.error("Error getting spin the bottle responses:", error);
            return "";
          }
        })(),
      ]);

    return {
      announcement,
      bouncer,
      staff,
      vip,
      vipplus,
      announcements,
      spinthebottle,
    };
  }

  /**
   * Update GitHub repository with all rooftop files in a single commit.
   * Required env vars: GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME
   * Optional env vars:
   *   - GITHUB_REPO_BRANCH (default: 'main')
   */
  async updateRepositoryWithRooftopFiles(
    commitMessage?: string,
  ): Promise<{
    updated: boolean;
    commitSha?: string;
    paths?: string[];
    branch?: string;
  }> {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_REPO_OWNER;
    const repo = process.env.GITHUB_REPO_NAME;
    const branch = process.env.GITHUB_REPO_BRANCH || "main";

    if (!token)
      {throw new Error("GITHUB_TOKEN environment variable is required");}
    if (!owner)
      {throw new Error("GITHUB_REPO_OWNER environment variable is required");}
    if (!repo)
      {throw new Error("GITHUB_REPO_NAME environment variable is required");}

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

    // Generate all rooftop file contents
    const files = await this.generateRooftopFiles();

    // Step 1: Get latest commit on branch
    const ref = await gh(`/repos/${owner}/${repo}/git/refs/heads/${branch}`);
    const latestCommitSha = (ref as { object?: { sha?: string } })?.object?.sha;
    if (!latestCommitSha)
      {throw new Error("Failed to resolve latest commit sha");}

    // Step 2: Get base tree of that commit
    const latestCommit = await gh(
      `/repos/${owner}/${repo}/git/commits/${latestCommitSha}`,
    );
    const baseTreeSha = (latestCommit as { tree?: { sha?: string } })?.tree?.sha;
    if (!baseTreeSha) {throw new Error("Failed to resolve base tree sha");}

    // Step 3: Create blobs for all files
    const fileData = [
      { path: "rooftop/announcement.txt", content: files.announcement },
      { path: "rooftop/bouncer.txt", content: files.bouncer },
      { path: "rooftop/staff.txt", content: files.staff },
      { path: "rooftop/vip.txt", content: files.vip },
      { path: "rooftop/vipplus.txt", content: files.vipplus },
      { path: "rooftop/announcements.txt", content: files.announcements },
      { path: "rooftop/spinthebottle.txt", content: files.spinthebottle },
    ];

    const blobShas = await Promise.all(
      fileData.map((file) =>
        gh(`/repos/${owner}/${repo}/git/blobs`, {
          method: "POST",
          body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
        }).then((blob) => {
          const sha = (blob as { sha?: string })?.sha;
          if (!sha) {throw new Error(`Failed to create blob for ${file.path}`);}
          return { path: file.path, sha };
        }),
      ),
    );

    // Step 4: Create a new tree with all updated files
    const newTree = await gh(`/repos/${owner}/${repo}/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: blobShas.map(({ path, sha }) => ({
          path,
          mode: "100644",
          type: "blob",
          sha,
        })),
      }),
    });
    const newTreeSha = (newTree as { sha?: string })?.sha;
    if (!newTreeSha) {throw new Error("Failed to create new tree");}

    // Step 5: Create a new commit
    const message =
      commitMessage?.trim() && commitMessage.length > 0
        ? commitMessage
        : `chore(rooftop): update rooftop files at ${new Date().toISOString()}`;

    // Optional author/committer identity
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

    const commitBody: {
      message: string;
      tree: string;
      parents: string[];
      author?: { name: string; email: string; date: string };
      committer?: { name: string; email: string; date: string };
    } = {
      message,
      tree: newTreeSha,
      parents: [latestCommitSha],
    };
    if (author) {
      commitBody.author = author;
    }
    if (committer) {
      commitBody.committer = committer;
    }

    const newCommit = await gh(`/repos/${owner}/${repo}/git/commits`, {
      method: "POST",
      body: JSON.stringify(commitBody),
    });
    const newCommitSha = (newCommit as { sha?: string })?.sha;
    if (!newCommitSha) {throw new Error("Failed to create new commit");}

    // Step 6: Update branch reference
    await gh(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: newCommitSha, force: false }),
    });

    return {
      updated: true,
      commitSha: newCommitSha,
      paths: fileData.map((f) => f.path),
      branch,
    };
  }
}

