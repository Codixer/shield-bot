// Location/instance–related VRChat API methods

import { RequestError } from "vrc-ts";
import { prisma } from "../../main.js";
import { ensureVRChatClient } from "./client.js";

type InstanceIdentifiers = { worldId: string; instanceId: string };
type FriendLocationRecord = Awaited<
  ReturnType<typeof findFriendInstanceOrWorld>
>;

const NON_PUBLIC_LOCATION_STATES = new Set([
  "offline",
  "travelling",
  "traveling",
]);

export async function findFriendInstanceOrWorld(userId: string) {
  const record = await prisma.friendLocation.findUnique({
    where: { vrcUserId: userId },
  });
  if (!record) {
    console.log(`[VRChat Friend Lookup] User not tracked: ${userId}`);
    return null;
  }
  return record;
}

export async function getFriendInstanceInfo(userId: string) {
  const record = await findFriendInstanceOrWorld(userId);
  if (!record) return null;
  // Handle special values
  if (
    !record.worldId ||
    !record.location ||
    NON_PUBLIC_LOCATION_STATES.has(record.location)
  ) {
    console.log(
      `[VRChat Instance Lookup] User ${userId} is not in a public instance (location: ${record.location})`,
    );
    return null;
  }
  // Special handling for private location with worldId and senderUserId
  if (record.location === "private") {
    if (!record.senderUserId) {
      console.log(
        `[VRChat Instance Lookup] Private instance not found for user ${userId}`,
      );
      return null;
    }

    const privateIdentifiers = parseInstanceFromFullLocation(record.worldId);
    if (!privateIdentifiers) {
      console.log(
        `[VRChat Instance Lookup] Private instance info is null for user ${userId}`,
      );
      return null;
    }

    return fetchInstanceInfo(privateIdentifiers, userId, "Private");
  }

  const identifiers = resolveInstanceIdentifiers(record);
  if (!identifiers) {
    console.log(
      `[VRChat Instance Lookup] Could not parse worldId/instanceId for user ${userId}`,
    );
    return null;
  }

  return fetchInstanceInfo(identifiers, userId, "Instance");
}

export async function getInstanceInfoByShortName(shortName: string) {
  if (!shortName) {
    console.log("[VRChat Instance Lookup] No shortName provided");
    return null;
  }
  const client = await ensureVRChatClient();
  try {
    const data = await client.instanceApi.getInstanceByShortName({ shortName });
    if (!data) {
      console.log(
        `[VRChat Instance Lookup] Instance info is null for shortName ${shortName}`,
      );
      return null;
    }
    return data;
  } catch (error) {
    if (error instanceof RequestError && error.statusCode === 404) {
      console.log(
        `[VRChat Instance Lookup] Instance not found for shortName ${shortName}`,
      );
      return null;
    }
    throw error;
  }
}

function resolveInstanceIdentifiers(
  record: FriendLocationRecord,
): InstanceIdentifiers | null {
  if (!record || !record.location) return null;

  if (record.location.includes(":")) {
    return parseInstanceFromFullLocation(record.location);
  }

  if (!record.worldId) return null;

  return { worldId: record.worldId, instanceId: record.location };
}

function parseInstanceFromFullLocation(
  location: string | null,
): InstanceIdentifiers | null {
  if (!location) return null;
  const separatorIndex = location.indexOf(":");
  if (separatorIndex === -1) return null;

  return {
    worldId: location.slice(0, separatorIndex),
    instanceId: location.slice(separatorIndex + 1),
  };
}

async function fetchInstanceInfo(
  identifiers: InstanceIdentifiers,
  userId: string,
  contextLabel: "Private" | "Instance",
) {
  const client = await ensureVRChatClient();
  try {
    const data = await client.instanceApi.getInstance(identifiers);
    if (!data) {
      console.log(
        `[VRChat Instance Lookup] ${contextLabel} instance info is null for user ${userId}`,
      );
      return null;
    }
    return data;
  } catch (error) {
    if (error instanceof RequestError && error.statusCode === 404) {
      const message =
        contextLabel === "Private"
          ? `[VRChat Instance Lookup] Private instance not found for user ${userId}`
          : `[VRChat Instance Lookup] Instance not found for user ${userId}`;
      console.log(message);
      return null;
    }
    throw error;
  }
}
