// VRChat API client using vrc-ts library

import { VRChatAPI } from "vrc-ts";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// User agent for VRChat API requests
export const USER_AGENT =
  process.env.VRCHAT_USER_AGENT ||
  "SomethingBrokeWithMyEnvFileSorry/0.0.1 contact@stefanocoding.me";

// Cookie path for vrc-ts (defaults to ./cookies.json, but we'll use a custom path)
const COOKIE_DIR = path.resolve(__dirname, "../../../.vrchat_cookies");
const COOKIE_FILE = path.join(COOKIE_DIR, "cookies.json");

// Create singleton VRChatAPI instance
// vrc-ts will handle cookies automatically if COOKIES_PATH is set
// We'll configure it to use our custom cookie directory
export const vrchatApi = new VRChatAPI({
  cookiePath: COOKIE_FILE,
  userAgent: USER_AGENT,
});

// Legacy cookie functions for backward compatibility (deprecated, use vrchatApi directly)
// These are kept for any code that might still reference them, but they're no longer used
export function saveCookie(_cookie: string) {
  // vrc-ts handles cookies internally, this is a no-op for backward compatibility
  console.warn("[VRChat] saveCookie() is deprecated. vrc-ts handles cookies automatically.");
}

export function loadCookie(): string | null {
  // vrc-ts handles cookies internally, this is a no-op for backward compatibility
  console.warn("[VRChat] loadCookie() is deprecated. vrc-ts handles cookies automatically.");
  return null;
}

// Export instance methods
export * from "./instance.js";