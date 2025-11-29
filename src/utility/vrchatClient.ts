// VRChat API client using vrc-ts library
import { VRChatAPI } from "vrc-ts";

// Configuration for the VRChat API client
const config = {
  username: process.env.VRCHAT_USERNAME!,
  password: process.env.VRCHAT_PASSWORD!,
  totp: process.env.VRCHAT_OTP_TOKEN,
  userAgent: process.env.VRCHAT_USER_AGENT || "ShieldBot/1.0.0 contact@stefanocoding.me",
  useCookies: true,
  cookiesPath: "./.vrchat_cookies/cookies.json",
};

// Create singleton VRChat API instance
export const vrchatApi = new VRChatAPI(config);

// Re-export commonly used types from vrc-ts
export { VRChatAPI } from "vrc-ts";

