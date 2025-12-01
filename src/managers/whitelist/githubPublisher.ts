import { loggers } from "../../utility/logger.js";

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
        let decryptedKey = privateKey;
        if (passphrase) {
          try {
            decryptedKey = await openpgp.decryptKey({ privateKey, passphrase });
          } catch (decryptError) {
            // If key is already decrypted, use it as-is
            if (
              decryptError instanceof Error &&
              decryptError.message.includes("already decrypted")
            ) {
              decryptedKey = privateKey;
            } else {
              throw decryptError;
            }
          }
        }
        const pgpMessage = await openpgp.createMessage({ text: payload });
        const signed = await openpgp.sign({
          message: pgpMessage,
          signingKeys: decryptedKey,
          detached: true,
          format: "armored",
        });
        // Extract the armored signature string
        // In openpgp v6, sign() with format: "armored" returns a Signature object
        // that is a ReadableStream - we need to read it as text
        if (typeof signed === "string") {
          signature = signed;
        } else if (signed && typeof signed.getReader === "function") {
          // Read the signature stream as text
          const chunks: Uint8Array[] = [];
          const reader = signed.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              chunks.push(value);
            }
          } finally {
            reader.releaseLock();
          }
          // Combine chunks and convert to string
          const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
          const combined = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }
          signature = new TextDecoder().decode(combined);
        } else {
          // Fallback: try to convert to string directly
          signature = String(signed);
        }
      } catch (e) {
        const errorData =
          e instanceof Error
            ? { message: e.message, stack: e.stack, name: e.name }
            : { error: String(e) };
        loggers.bot.warn(
          "Failed to sign commit, falling back to unsigned commit",
          errorData,
        );
      }
    }

    const commitBody: {
      message: string;
      tree: string;
      parents: string[];
      author?: { name: string; email: string; date: string };
      committer?: { name: string; email: string; date: string };
      signature?: string;
    } = {
      message,
      tree: newTreeSha,
      parents: [latestCommitSha],
    };
    if (author) {commitBody.author = author;}
    if (committer) {commitBody.committer = committer;}
    if (signature) {commitBody.signature = signature;}

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
   * Build the raw commit payload used for PGP signing.
   * Format matches Git commit object:
   *   tree <treeSha>\n
   *   parent <parentSha>\n
   *   author Name <email> <unixSeconds> +0000\n
   *   committer Name <email> <unixSeconds> +0000\n
   *   \n
   *   <message>\n
   * Note: Exactly one newline after the message (no trailing empty line)
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
    ];
    return lines.join("\n") + "\n";
  }
}

