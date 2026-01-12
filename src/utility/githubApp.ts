import { createSign, createPrivateKey } from "crypto";
import { loggers } from "./logger.js";

/**
 * Cache entry for installation tokens
 */
interface InstallationTokenCache {
  token: string;
  expiresAt: number;
}

/**
 * Cache for installation tokens (keyed by installation ID)
 * Installation tokens expire after ~1 hour
 */
const installationTokenCache = new Map<string, InstallationTokenCache>();

/**
 * Cache for JWT tokens (keyed by app ID)
 * JWT tokens expire after 10 minutes (GitHub limit)
 */
interface JWTCache {
  jwt: string;
  expiresAt: number;
}
const jwtCache = new Map<string, JWTCache>();

/**
 * Generate a JWT token for GitHub App authentication
 * @param appId GitHub App ID
 * @param privateKey Private key in PEM format
 * @returns JWT token string
 * @throws Error if JWT generation fails
 */
export function generateAppJWT(appId: string, privateKey: string): string {
  try {
    // Check cache first
    const cached = jwtCache.get(appId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.jwt;
    }

    // Parse the private key
    const key = createPrivateKey({
      key: privateKey,
      format: "pem",
    });

    // JWT header (always the same for GitHub App)
    const header = {
      alg: "RS256",
      typ: "JWT",
    };

    // JWT payload
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now - 60, // Issued at (1 minute ago to account for clock skew)
      exp: now + 600, // Expires in 10 minutes (GitHub limit)
      iss: appId, // Issuer (GitHub App ID)
    };

    // Encode header and payload as base64url
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));

    // Create signature
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const sign = createSign("RSA-SHA256");
    sign.update(signatureInput);
    sign.end();
    const signature = sign.sign(key, "base64");
    const encodedSignature = base64UrlEncode(Buffer.from(signature, "base64"));

    // Construct JWT
    const jwt = `${encodedHeader}.${encodedPayload}.${encodedSignature}`;

    // Cache the JWT (expires in 9 minutes to be safe)
    jwtCache.set(appId, {
      jwt,
      expiresAt: Date.now() + 9 * 60 * 1000,
    });

    return jwt;
  } catch (error) {
    loggers.bot.error("Failed to generate GitHub App JWT", error);
    throw new Error("Failed to generate GitHub App JWT");
  }
}

/**
 * Get an installation access token for a GitHub App installation
 * @param jwt JWT token for the GitHub App
 * @param installationId Installation ID
 * @returns Installation access token
 * @throws Error if token retrieval fails
 */
export async function getInstallationToken(
  jwt: string,
  installationId: string,
): Promise<string> {
  try {
    const response = await fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${jwt}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `GitHub API error ${response.status} ${response.statusText}: ${text}`,
      );
    }

    const data = (await response.json()) as {
      token?: string;
      expires_at?: string;
    };

    if (!data.token) {
      throw new Error("No token in GitHub API response");
    }

    // Parse expiration time (ISO 8601 format)
    const expiresAt = data.expires_at
      ? new Date(data.expires_at).getTime()
      : Date.now() + 60 * 60 * 1000; // Default to 1 hour if not provided

    // Cache the token
    installationTokenCache.set(installationId, {
      token: data.token,
      expiresAt,
    });

    return data.token;
  } catch (error) {
    loggers.bot.error(
      `Failed to get installation token for installation ${installationId}`,
      error,
    );
    throw error;
  }
}

/**
 * Get a cached installation token, refreshing if needed
 * @param appId GitHub App ID
 * @param privateKey Private key in PEM format
 * @param installationId Installation ID
 * @returns Installation access token
 * @throws Error if token retrieval fails
 */
export async function getCachedInstallationToken(
  appId: string,
  privateKey: string,
  installationId: string,
): Promise<string> {
  // Check cache first
  const cached = installationTokenCache.get(installationId);
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    // Return cached token if it has more than 5 minutes left
    return cached.token;
  }

  // Generate JWT and get new installation token
  const jwt = generateAppJWT(appId, privateKey);
  return await getInstallationToken(jwt, installationId);
}

/**
 * Base64 URL encode (RFC 4648 §5)
 * Converts base64 to base64url by replacing + with -, / with _, and removing padding
 */
function base64UrlEncode(data: string | Buffer): string {
  const buffer = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Clear the JWT cache for an app (useful for testing or key rotation)
 * @param appId GitHub App ID
 */
export function clearJWTCache(appId?: string): void {
  if (appId) {
    jwtCache.delete(appId);
  } else {
    jwtCache.clear();
  }
}

/**
 * Clear the installation token cache (useful for testing or forced refresh)
 * @param installationId Installation ID (optional, clears all if not provided)
 */
export function clearInstallationTokenCache(installationId?: string): void {
  if (installationId) {
    installationTokenCache.delete(installationId);
  } else {
    installationTokenCache.clear();
  }
}
