// Invite message–related VRChat API methods
// NOTE: This functionality has been disabled as it's not currently in use
// The functions are stubbed out to prevent errors if they're still referenced

// import type { InviteMessage } from "../../managers/messages/InviteMessageManager.js"; // Not used in disabled functions

/**
 * Update an invite message
 * DISABLED: Not in use
 */
export async function updateInviteMessage(_params: {
  userId: string;
  messageType?: "message" | "response" | "request" | "requestResponse";
  slot?: number;
  message: string;
}): Promise<never> {
  console.warn("[VRChat Messages] updateInviteMessage is disabled - functionality not in use");
  throw new Error("Invite message functionality has been disabled");
}

/**
 * List invite messages
 * DISABLED: Not in use
 */
export async function listInviteMessages(_params: {
  userId: string;
  messageType?: "message" | "response" | "request" | "requestResponse";
}): Promise<never> {
  console.warn("[VRChat Messages] listInviteMessages is disabled - functionality not in use");
  throw new Error("Invite message functionality has been disabled");
}