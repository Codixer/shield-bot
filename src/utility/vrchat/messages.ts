// Invite message–related VRChat API methods
// Note: vrc-ts doesn't have direct message API methods, so we use fetch with vrc-ts cookies

import { RequestError } from "vrc-ts";
import fetch from "node-fetch";
import { vrchatApi, USER_AGENT } from "./index.js";
import type { InviteMessage } from "../../managers/messages/InviteMessageManager.js";

/**
 * Get cookies from vrc-ts cookie manager for authenticated requests
 */
async function getAuthenticatedHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
  };

  // Get cookies from vrc-ts cookie manager
  try {
    // Check if user is authenticated
    if (!vrchatApi.isAuthentificated && !vrchatApi.currentUser) {
      throw new Error("Not authenticated. Please log in first.");
    }

    // Get cookies from vrc-ts instanceCookie manager
    const cookies = vrchatApi.instanceCookie.getCookies();
    
    if (cookies && cookies.length > 0) {
      // Format cookies as HTTP Cookie header string
      // VRCCookie format: { name: string, value: string, domain?: string, path?: string, ... }
      const cookieString = cookies
        .map((c: any) => `${c.name}=${c.value}`)
        .join("; ");
      
      if (cookieString) {
        headers["Cookie"] = cookieString;
      } else {
        throw new Error("No valid cookies found in vrc-ts cookie manager");
      }
    } else {
      throw new Error("No cookies available from vrc-ts cookie manager");
    }
  } catch (error) {
    console.error("[VRChat Messages] Could not get cookies from vrc-ts:", error);
    throw new Error(`Failed to get authentication cookies: ${error instanceof Error ? error.message : String(error)}`);
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
      const errorText = await response.text();
      throw new Error(
        `Failed to update invite message: ${response.status} ${response.statusText} - ${errorText}`,
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
      const errorText = await response.text();
      throw new Error(
        `Failed to list invite messages: ${response.status} ${response.statusText} - ${errorText}`,
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