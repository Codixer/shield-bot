// Location/instance–related VRChat API methods using vrc-ts

import { prisma } from "../../main.js";
import { RequestError, InstanceIdType, WorldIdType } from "vrc-ts";
import { vrchatApi } from "./index.js";
import { getInstanceInfoByShortName } from "./instance.js";
import { loggers } from "../logger.js";
import type { VRChatInstance } from "./types.js";

/**
 * Find friend instance or world from database
 */
export async function findFriendInstanceOrWorld(userId: string) {
  const record = await prisma.friendLocation.findUnique({
    where: { vrcUserId: userId },
  });
  if (!record) {
    loggers.vrchat.debug(`User not tracked: ${userId}`);
    return null;
  }
  return record;
}

/**
 * Get friend instance info
 */
export async function getFriendInstanceInfo(userId: string): Promise<VRChatInstance | null> {
  const record = await findFriendInstanceOrWorld(userId);
  if (!record) {return null;}

  // Handle special values
  if (
    !record.worldId ||
    !record.location ||
    record.location === "offline" ||
    record.location === "travelling" ||
    record.location === "traveling"
  ) {
    loggers.vrchat.debug(
      `User ${userId} is not in a public instance (location: ${record.location})`,
    );
    return null;
  }

  // Special handling for private location with worldId and senderUserId
  if (record.location === "private" && record.worldId && record.senderUserId) {
    // record.worldId is a full instance URL (worlduuid:instanceUuid~...)
    try {
      const result = await vrchatApi.instanceApi.getInstance({
        worldId: record.worldId.split(":")[0] as WorldIdType, // Extract worldId from full instance string
        instanceId: record.worldId as InstanceIdType,
      });
      return result as VRChatInstance;
    } catch (error: unknown) {
      if (error instanceof RequestError && error.statusCode === 404) {
        loggers.vrchat.debug(
          `Private instance not found for user ${userId}`,
        );
        return null;
      }
      throw error;
    }
  }

  // The location is usually in the form worldId:instanceId or just instanceId
  let worldId = record.worldId;
  let instanceId: string | null = null;
  if (record.location.includes(":")) {
    const parts = record.location.split(":");
    worldId = parts[0];
    instanceId = parts[1];
  } else {
    instanceId = record.location;
  }

  if (!worldId || !instanceId) {
    loggers.vrchat.debug(
      `Could not parse worldId/instanceId for user ${userId}`,
    );
    return null;
  }

  try {
    const instanceIdFull = `${worldId}:${instanceId}`;
    const result = await vrchatApi.instanceApi.getInstance({
      worldId: worldId as WorldIdType,
      instanceId: instanceIdFull as InstanceIdType,
    });
    return result as VRChatInstance;
  } catch (error: unknown) {
    if (error instanceof RequestError && error.statusCode === 404) {
      loggers.vrchat.debug(
        `Instance not found for user ${userId}`,
      );
      return null;
    }
    throw error;
  }
}

// Re-export getInstanceInfoByShortName from instance.ts for backward compatibility
export { getInstanceInfoByShortName };