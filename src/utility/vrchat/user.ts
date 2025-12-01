// User-related VRChat API methods using vrc-ts

import { RequestError, NotificationIdType } from "vrc-ts";
import { vrchatApi } from "./index.js";
import { prisma } from "../../main.js";
import type { VRChatUser } from "./types.js";

/**
 * Send a friend request to a user
 */
export async function sendFriendRequest(userId: string): Promise<unknown> {
  try {
    return await vrchatApi.friendApi.sendFriendRequest({ userId });
  } catch (error: unknown) {
    // If already friends, unfriend and try again
    if (error instanceof RequestError && error.statusCode === 400) {
      await unfriendUser(userId);
      return await vrchatApi.friendApi.sendFriendRequest({ userId });
    }
    throw error;
  }
}

/**
 * Unfriend a user
 */
export async function unfriendUser(userId: string): Promise<unknown> {
  return await vrchatApi.friendApi.unfriend({ userId });
}

/**
 * Login to VRChat and get current user
 * vrc-ts handles 2FA automatically if VRCHAT_2FA_SECRET is set in environment
 * Note: login() uses credentials from constructor or environment variables
 */
export async function loginAndGetCurrentUser(
  username: string,
  password: string,
): Promise<VRChatUser> {
  // Set credentials in the API instance before calling login
  vrchatApi.username = username;
  vrchatApi.password = password;
  
  // vrc-ts login() takes no arguments - uses instance properties
  await vrchatApi.login();
  
  // Return current user after login
  if (!vrchatApi.currentUser) {
    throw new Error("Login successful but current user is not available");
  }
  
  return vrchatApi.currentUser as VRChatUser;
}

/**
 * Check if logged in and verified
 */
export async function isLoggedInAndVerified(): Promise<boolean> {
  try {
    const user = vrchatApi.currentUser;
    if (!user || !user.id) {return false;}
    
    // Check verification status using correct property names
    if (user.twoFactorAuthEnabled && user.hasEmail && user.emailVerified) {return true;}
    if (!user.twoFactorAuthEnabled && user.id) {return true;}
    return false;
  } catch {
    return false;
  }
}

/**
 * Search for users
 */
export async function searchUsers({
  search,
  n = 60,
  offset = 0,
  developerType: _developerType,
}: {
  search: string;
  n?: number;
  offset?: number;
  developerType?: string;
}): Promise<VRChatUser[]> {
  if (!search) {throw new Error("Search query is required");}
  
  const result = await vrchatApi.userApi.searchAllUsers({
    search,
    n,
    offset,
    // developerType is not a parameter in searchAllUsers
  });
  // searchAllUsers returns an array directly, not an object with a data property
  return (result as VRChatUser[]) || [];
}

/**
 * Accept a friend request notification
 */
export async function acceptFriendRequest(notificationId: string): Promise<unknown> {
  return await vrchatApi.notificationApi.acceptFriendRequest({
    notificationId: notificationId as NotificationIdType,
  });
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<VRChatUser | null> {
  if (!userId) {throw new Error("User ID is required");}
  
  try {
    return await vrchatApi.userApi.getUserById({ userId });
  } catch (error: unknown) {
    if (error instanceof RequestError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Get current logged in user
 */
export async function getCurrentUser(): Promise<VRChatUser | null> {
  try {
    // Try to get from cache first
    if (vrchatApi.currentUser) {
      return vrchatApi.currentUser as VRChatUser;
    }
    
    // If not cached, fetch from API
    return (await vrchatApi.authApi.getCurrentUser()) as VRChatUser;
  } catch (error: unknown) {
    if (error instanceof RequestError && error.statusCode === 401) {
      return null;
    }
    throw error;
  }
}

/**
 * Get VRChat account status for a Discord user
 */
export async function getVRChatAccountStatus(discordId: string) {
  const user = await prisma.user.findUnique({
    where: { discordId },
    include: { vrchatAccounts: true },
  });

  const boundAccounts = user?.vrchatAccounts || [];
  const verifiedAccounts = boundAccounts.filter(
    (acc: { accountType: string }) => acc.accountType === "MAIN" || acc.accountType === "ALT",
  );

  return {
    hasBoundAccount: boundAccounts.length > 0,
    hasVerifiedAccount: verifiedAccounts.length > 0,
    boundAccounts,
    verifiedAccounts,
  };
}