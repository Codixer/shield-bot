// Invite message–related VRChat API methods

import { loadCookie, USER_AGENT } from "../vrchat/index.js";
import { vrchatFetch } from "./rateLimiter.js";
import type { InviteMessage } from "../../managers/messages/InviteMessageManager.js";

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
}) {
  if (!userId) throw new Error("userId is required");
  if (slot < 0 || slot > 11) throw new Error("slot must be between 0 and 11");
  const cookie = loadCookie();
  if (!cookie) throw new Error("Not authenticated. Please log in first.");
  const url = `https://api.vrchat.cloud/api/1/message/${encodeURIComponent(userId)}/${messageType}/${slot}`;
  const response = await vrchatFetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      Cookie: cookie,
    },
    body: JSON.stringify({ message }),
  });
  // Note: 429 is now handled automatically by vrchatFetch with retry logic
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to update invite message: ${response.status} ${text}`,
    );
  }
  return await response.json();
}

export async function listInviteMessages({
  userId,
  messageType = "message",
}: {
  userId: string;
  messageType?: "message" | "response" | "request" | "requestResponse";
}): Promise<InviteMessage[]> {
  if (!userId) throw new Error("userId is required");
  const cookie = loadCookie();
  if (!cookie) throw new Error("Not authenticated. Please log in first.");
  const url = `https://api.vrchat.cloud/api/1/message/${encodeURIComponent(userId)}/${messageType}`;
  const response = await vrchatFetch(url, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Cookie: cookie,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to list invite messages: ${response.status} ${text}`,
    );
  }
  return (await response.json()) as InviteMessage[];
}
