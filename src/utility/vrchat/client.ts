import { VRChatAPI } from "vrc-ts";

const DEFAULT_USER_AGENT =
  process.env.VRCHAT_USER_AGENT ||
  "SomethingBrokeWithMyEnvFileSorry/0.0.1 contact@stefanocoding.me";

let clientPromise: Promise<VRChatAPI> | null = null;

async function createVRChatClient(): Promise<VRChatAPI> {
  const username = process.env.VRCHAT_USERNAME;
  const password = process.env.VRCHAT_PASSWORD;
  const twoFactorSecret = process.env.VRCHAT_OTP_TOKEN;

  if (!username || !password) {
    throw new Error(
      "VRCHAT_USERNAME and VRCHAT_PASSWORD must be set before accessing VRChat APIs.",
    );
  }

  if (!twoFactorSecret) {
    throw new Error(
      "VRCHAT_OTP_TOKEN must be set to generate 2FA codes for VRChat authentication.",
    );
  }

  const api = new VRChatAPI({
    username,
    password,
    userAgent: DEFAULT_USER_AGENT,
    TwoFactorAuthSecret: twoFactorSecret,
    useCookies: false,
  });

  await api.login();
  return api;
}

/**
 * Lazily logs into VRChat once and reuses the authenticated client for the process lifetime.
 */
export async function ensureVRChatClient(): Promise<VRChatAPI> {
  if (!clientPromise) {
    clientPromise = createVRChatClient().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }

  return clientPromise;
}

/**
 * Clears the cached VRChat client so the next call re-authenticates.
 */
export function resetVRChatClient() {
  clientPromise = null;
}
