import { loadCookie, USER_AGENT } from "./index.js";
import fetch from "node-fetch";
import { getCurrentUser } from "./user.js";

export async function createInstance({
  worldId,
  type = "friends",
  region = "us",
  ownerId,
  canRequestInvite = false,
}: {
  worldId: string;
  type?: "public" | "hidden" | "friends" | "private" | "group";
  region?: "us" | "use" | "eu" | "jp";
  ownerId?: string;
  canRequestInvite?: boolean;
}) {
  const cookie = loadCookie();
  if (!cookie) throw new Error("Not authenticated. Please log in first.");

  const url = "https://api.vrchat.cloud/api/1/instances";

  const body: any = {
    worldId,
    type,
    region,
    canRequestInvite,
  };

  // For non-public instances, ownerId is required
  if (type !== "public") {
    if (!ownerId) {
      // Get the bot's own user ID if not provided
      const currentUser = await getCurrentUser();
      if (!currentUser || !currentUser.id) {
        throw new Error("Failed to get current user ID for instance creation");
      }
      body.ownerId = currentUser.id;
    } else {
      body.ownerId = ownerId;
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to create instance: ${response.status} ${text}`
    );
  }

  return (await response.json()) as any;
}

export async function inviteUser(userId: string, instanceLocation: string) {
  const cookie = loadCookie();
  if (!cookie) throw new Error("Not authenticated. Please log in first.");

  const url = `https://api.vrchat.cloud/api/1/invite/${userId}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      Cookie: cookie,
    },
    body: JSON.stringify({
      instanceId: instanceLocation,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to invite user: ${response.status} ${text}`
    );
  }

  return (await response.json()) as any;
}
