// VRChat Group API utilities

import { loadCookie, USER_AGENT } from "./index.js";
import fetch from "node-fetch";

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
  const cookie = loadCookie();
  if (!cookie) {
    throw new Error("Not logged in to VRChat");
  }

  const url = `https://api.vrchat.cloud/api/1/groups/${groupId}/invites`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId,
      confirmOverrideBlock: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to invite user to group: ${response.status} ${errorText}`,
    );
  }

  // API returns 200 with empty body on success
  return response.status === 200;
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
  const cookie = loadCookie();
  if (!cookie) {
    throw new Error("Not logged in to VRChat");
  }

  const url = `https://api.vrchat.cloud/api/1/groups/${groupId}/members/${userId}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Cookie: cookie,
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null; // User not in group
    }
    const errorText = await response.text();
    throw new Error(
      `Failed to get group member: ${response.status} ${errorText}`,
    );
  }

  return await response.json();
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
  const cookie = loadCookie();
  if (!cookie) {
    throw new Error("Not logged in to VRChat");
  }

  const url = `https://api.vrchat.cloud/api/1/groups/${groupId}/members/${userId}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "User-Agent": USER_AGENT,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to update group member: ${response.status} ${errorText}`,
    );
  }

  return await response.json();
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
  const cookie = loadCookie();
  if (!cookie) {
    throw new Error("Not logged in to VRChat");
  }

  const url = `https://api.vrchat.cloud/api/1/groups/${groupId}/members/${userId}/roles/${roleId}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "User-Agent": USER_AGENT,
      Cookie: cookie,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to add role to group member: ${response.status} ${errorText}`,
    );
  }

  return await response.json();
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
  const cookie = loadCookie();
  if (!cookie) {
    throw new Error("Not logged in to VRChat");
  }

  const url = `https://api.vrchat.cloud/api/1/groups/${groupId}/members/${userId}/roles/${roleId}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "User-Agent": USER_AGENT,
      Cookie: cookie,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to remove role from group member: ${response.status} ${errorText}`,
    );
  }

  return await response.json();
}

/**
 * Get all roles for a group
 * @param groupId The VRChat group ID
 * @returns Promise resolving to list of group roles
 */
export async function getGroupRoles(groupId: string): Promise<any> {
  const cookie = loadCookie();
  if (!cookie) {
    throw new Error("Not logged in to VRChat");
  }

  const url = `https://api.vrchat.cloud/api/1/groups/${groupId}/roles`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Cookie: cookie,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get group roles: ${response.status} ${errorText}`);
  }

  const data: any = await response.json();
  return data;
}
