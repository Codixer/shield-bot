// VRChat Group API utilities using vrc-ts

import { RequestError, GroupIdType, GroupUserVisibility, GroupRoleIdType } from "vrc-ts";
import { vrchatApi } from "./index.js";

/**
 * Invite a user to a VRChat group
 * @param groupId The VRChat group ID (e.g., grp_xxx)
 * @param userId The VRChat user ID to invite (e.g., usr_xxx)
 * @returns Promise resolving to the invitation response
 */
export async function inviteUserToGroup(
  groupId: string,
  userId: string,
): Promise<any> {
  try {
    return await vrchatApi.groupApi.inviteUsertoGroup({
      groupId: groupId as GroupIdType,
      userId,
      confirmOverrideBlock: true,
    });
  } catch (error: any) {
    if (error instanceof RequestError) {
      throw new Error(
        `Failed to invite user to group: ${error.statusCode} ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * Get information about a group member
 * @param groupId The VRChat group ID
 * @param userId The VRChat user ID
 * @returns Promise resolving to the member information
 */
export async function getGroupMember(
  groupId: string,
  userId: string,
): Promise<any> {
  try {
    return await vrchatApi.groupApi.getGroupMember({
      groupId: groupId as GroupIdType,
      userId,
    });
  } catch (error: any) {
    if (error instanceof RequestError && error.statusCode === 404) {
      return null; // User not in group
    }
    if (error instanceof RequestError) {
      throw new Error(
        `Failed to get group member: ${error.statusCode} ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * Update a group member's roles (assign/unassign)
 * This endpoint allows updating member visibility, subscription settings, and manager notes
 * For role management, use addRoleToGroupMember or removeRoleFromGroupMember
 * @param groupId The VRChat group ID
 * @param userId The VRChat user ID
 * @param updates Object with fields to update
 * @returns Promise resolving to the updated member information
 */
export async function updateGroupMember(
  groupId: string,
  userId: string,
  updates: {
    visibility?: "visible" | "hidden" | "friends";
    isSubscribedToAnnouncements?: boolean;
    isSubscribedToEventAnnouncements?: boolean;
    managerNotes?: string;
  },
): Promise<any> {
  try {
    // Map visibility string to GroupUserVisibility enum
    const visibility = updates.visibility 
      ? (updates.visibility === "visible" ? GroupUserVisibility.Visible :
         updates.visibility === "hidden" ? GroupUserVisibility.Hidden :
         GroupUserVisibility.Friends)
      : undefined;

    return await vrchatApi.groupApi.updateGroupMember({
      groupId: groupId as GroupIdType,
      userId,
      visibility,
      isSubscribedToAnnouncements: updates.isSubscribedToAnnouncements,
      managerNotes: updates.managerNotes,
      // Note: isSubscribedToEventAnnouncements is not supported by vrc-ts API
    });
  } catch (error: any) {
    if (error instanceof RequestError) {
      throw new Error(
        `Failed to update group member: ${error.statusCode} ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * Add a role to a group member
 * @param groupId The VRChat group ID
 * @param userId The VRChat user ID
 * @param roleId The VRChat group role ID (e.g., grol_xxx)
 * @returns Promise resolving to the updated member list
 */
export async function addRoleToGroupMember(
  groupId: string,
  userId: string,
  roleId: string,
): Promise<any> {
  try {
    return await vrchatApi.groupApi.addRoleToGroupMember({
      groupId: groupId as GroupIdType,
      userId,
      groupRoleId: roleId as GroupRoleIdType, // vrc-ts uses groupRoleId, not roleId
    });
  } catch (error: any) {
    if (error instanceof RequestError) {
      throw new Error(
        `Failed to add role to group member: ${error.statusCode} ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * Remove a role from a group member
 * @param groupId The VRChat group ID
 * @param userId The VRChat user ID
 * @param roleId The VRChat group role ID (e.g., grol_xxx)
 * @returns Promise resolving to the updated member list
 */
export async function removeRoleFromGroupMember(
  groupId: string,
  userId: string,
  roleId: string,
): Promise<any> {
  try {
    return await vrchatApi.groupApi.removeRoleFromGroupMember({
      groupId: groupId as GroupIdType,
      userId,
      groupRoleId: roleId as GroupRoleIdType, // vrc-ts uses groupRoleId, not roleId
    });
  } catch (error: any) {
    if (error instanceof RequestError) {
      throw new Error(
        `Failed to remove role from group member: ${error.statusCode} ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * Get all roles for a group
 * @param groupId The VRChat group ID
 * @returns Promise resolving to list of group roles
 */
export async function getGroupRoles(groupId: string): Promise<any> {
  try {
    return await vrchatApi.groupApi.getGroupRoles({ 
      groupId: groupId as GroupIdType 
    });
  } catch (error: any) {
    if (error instanceof RequestError) {
      throw new Error(
        `Failed to get group roles: ${error.statusCode} ${error.message}`,
      );
    }
    throw error;
  }
}