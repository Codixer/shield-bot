// Instance-related VRChat API methods using vrc-ts

import { RequestError, InstanceRegionType, InstanceAccessNormalType, WorldIdType, InstanceIdType } from "vrc-ts";
import { vrchatApi } from "./index.js";
import { getCurrentUser } from "./user.js";

/**
 * Create a VRChat instance
 */
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
}): Promise<any> {
  // For non-public instances, ownerId is required
  let finalOwnerId = ownerId;
  if (type !== "public" && !finalOwnerId) {
    // Get the bot's own user ID if not provided
    const currentUser = await getCurrentUser();
    if (!currentUser || !currentUser.id) {
      throw new Error("Failed to get current user ID for instance creation");
    }
    finalOwnerId = currentUser.id;
  }

  try {
    // Map type to InstanceAccessNormalType
    const instanceType = type === "public" ? "public" :
                        type === "hidden" ? "hidden" :
                        type === "friends" ? "friends" :
                        type === "private" ? "private" : "friends";
    
    // Map region to InstanceRegionType
    const instanceRegion = (region === "us" ? "us" :
                            region === "use" ? "use" :
                            region === "eu" ? "eu" :
                            region === "jp" ? "jp" : "us") as InstanceRegionType;

    return await vrchatApi.instanceApi.generateNormalInstance({
      worldId: worldId as WorldIdType,
      instanceType: instanceType as unknown as InstanceAccessNormalType,
      region: instanceRegion,
      ownerId: finalOwnerId,
      // canRequestInvite is not a parameter in generateNormalInstance
    });
  } catch (error: any) {
    if (error instanceof RequestError) {
      throw new Error(
        `Failed to create instance: ${error.statusCode} ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * Invite a user to an instance
 */
export async function inviteUser(
  userId: string,
  instanceLocation: string,
): Promise<any> {
  try {
    return await vrchatApi.inviteApi.inviteUser({
      userId,
      instanceId: instanceLocation as InstanceIdType,
    });
  } catch (error: any) {
    if (error instanceof RequestError) {
      throw new Error(
        `Failed to invite user: ${error.statusCode} ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * Get instance info by short name (e.g., from vrch.at links)
 */
export async function getInstanceInfoByShortName(
  shortName: string,
): Promise<any | null> {
  if (!shortName) {
    console.log("[VRChat Instance Lookup] No shortName provided");
    return null;
  }

  try {
    return await vrchatApi.instanceApi.getInstanceByShortName({
      shortName,
    });
  } catch (error: any) {
    if (error instanceof RequestError && error.statusCode === 404) {
      console.log(
        `[VRChat Instance Lookup] Instance not found for shortName ${shortName}`,
      );
      return null;
    }
    if (error instanceof RequestError) {
      throw new Error(
        `Failed to fetch instance info by shortName: ${error.statusCode} ${error.message}`,
      );
    }
    throw error;
  }
}