// Invite message–related VRChat API methods
// Note: vrc-ts doesn't have direct message API methods, so we use fetch with vrc-ts cookies

import { RequestError } from "vrc-ts";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { vrchatApi, USER_AGENT } from "./index.js";
import type { InviteMessage } from "../../managers/messages/InviteMessageManager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIE_FILE = path.resolve(__dirname, "../../../.vrchat_cookies/cookies.json");

/**
 * Get cookies from vrc-ts cookie file for authenticated requests
 */
async function getAuthenticatedHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
  };

  // Read cookies from vrc-ts cookie file
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      const cookieData = JSON.parse(fs.readFileSync(COOKIE_FILE, "utf-8"));
      // vrc-ts stores cookies in a specific format
      // Try to extract cookie string from the stored data
      if (cookieData && typeof cookieData === "object") {
        // vrc-ts may store cookies as an array or object
        if (Array.isArray(cookieData)) {
          const cookieString = cookieData
            .map((c: any) => `${c.name || c.key}=${c.value}`)
            .join("; ");
          if (cookieString) {
            headers["Cookie"] = cookieString;
          }
        } else if (cookieData.cookies) {
          // If cookies are nested
          const cookieString = cookieData.cookies
            .map((c: any) => `${c.name || c.key}=${c.value}`)
            .join("; ");
          if (cookieString) {
            headers["Cookie"] = cookieString;
          }
        } else if (cookieData.cookie) {
          // If stored as a single cookie string
          headers["Cookie"] = cookieData.cookie;
        }
      }
    }
  } catch (error) {
    console.warn("[VRChat Messages] Could not read cookies from vrc-ts cookie file:", error);
  }

  return headers;
}

/**
 * Update an invite message
 */
export async function updateInviteMessage({
  userId,
  messageType = "message",
  slot = 0,
  message,
}: {
  userId: string;
  messageType?: "message" | "response" | "request" | "requestResponse";
  slot?: number;
  message: string;
}): Promise<any> {
  if (!userId) throw new Error("userId is required");
  if (slot < 0 || slot > 11) throw new Error("slot must be between 0 and 11");

  const url = `https://api.vrchat.cloud/api/1/message/${encodeURIComponent(userId)}/${messageType}/${slot}`;
  const headers = await getAuthenticatedHeaders();

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to update invite message: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  } catch (error: any) {
    if (error instanceof RequestError) {
      throw new Error(
        `Failed to update invite message: ${error.statusCode} ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * List invite messages
 */
export async function listInviteMessages({
  userId,
  messageType = "message",
}: {
  userId: string;
  messageType?: "message" | "response" | "request" | "requestResponse";
}): Promise<InviteMessage[]> {
  if (!userId) throw new Error("userId is required");

  const url = `https://api.vrchat.cloud/api/1/message/${encodeURIComponent(userId)}/${messageType}`;
  const headers = await getAuthenticatedHeaders();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to list invite messages: ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as InviteMessage[];
  } catch (error: any) {
    if (error instanceof RequestError) {
      throw new Error(
        `Failed to list invite messages: ${error.statusCode} ${error.message}`,
      );
    }
    throw error;
  }
}