// Shared utilities/constants for VRChat API

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const USER_AGENT =
  process.env.VRCHAT_USER_AGENT ||
  "SomethingBrokeWithMyEnvFileSorry/0.0.1 contact@stefanocoding.me";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIE_DIR = path.resolve(__dirname, "../../../.vrchat_cookies");
const COOKIE_FILE = path.join(COOKIE_DIR, "cookie.json");

export function saveCookie(cookie: string) {
  if (!fs.existsSync(COOKIE_DIR)) fs.mkdirSync(COOKIE_DIR, { recursive: true });
  fs.writeFileSync(COOKIE_FILE, JSON.stringify({ cookie }), "utf-8");
}

export function loadCookie(): string | null {
  if (fs.existsSync(COOKIE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(COOKIE_FILE, "utf-8"));
      return data.cookie;
    } catch {
      return null;
    }
  }
  return null;
}

export * from "./instance.js";
