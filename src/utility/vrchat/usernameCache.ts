import { prisma } from "../../main.js";
import { getUserById } from "./user.js";
import { loggers } from "../logger.js";

/**
 * Update VRChat username cache for a user if needed
 * Updates if the username is different or if it hasn't been updated in a week
 */
export async function updateUsernameCache(vrcUserId: string): Promise<void> {
  try {
    // Find the VRChat account
    const vrcAccount = await prisma.vRChatAccount.findFirst({
      where: { vrcUserId },
    });

    if (!vrcAccount) {
      return; // No account found, nothing to update
    }

    // Check if we need to update the username
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const shouldUpdate =
      !vrcAccount.usernameUpdatedAt ||
      vrcAccount.usernameUpdatedAt < oneWeekAgo;

    if (!shouldUpdate) {
      return; // Recently updated, skip
    }

    // Fetch current username from VRChat API
    const userInfo = await getUserById(vrcUserId);
    const currentUsername = userInfo?.displayName || userInfo?.username;

    if (!currentUsername) {
      loggers.vrchat.warn(
        `Could not fetch username for ${vrcUserId}`,
      );
      return;
    }

    // Update if username changed or if it's been more than a week
    if (currentUsername !== vrcAccount.vrchatUsername || shouldUpdate) {
      await prisma.vRChatAccount.update({
        where: { id: vrcAccount.id },
        data: {
          vrchatUsername: currentUsername,
          usernameUpdatedAt: new Date(),
        },
      });

      loggers.vrchat.debug(
        `Updated username for ${vrcUserId}: ${currentUsername}`,
      );
    }
  } catch (error) {
    loggers.vrchat.warn(
      `Failed to update username for ${vrcUserId}`,
      error,
    );
  }
}

/**
 * Force update username cache for a user (ignores time restrictions)
 */
export async function forceUpdateUsernameCache(
  vrcUserId: string,
): Promise<void> {
  try {
    const vrcAccount = await prisma.vRChatAccount.findFirst({
      where: { vrcUserId },
    });

    if (!vrcAccount) {
      return;
    }

    const userInfo = await getUserById(vrcUserId);
    const currentUsername = userInfo?.displayName || userInfo?.username;

    if (currentUsername) {
      await prisma.vRChatAccount.update({
        where: { id: vrcAccount.id },
        data: {
          vrchatUsername: currentUsername,
          usernameUpdatedAt: new Date(),
        },
      });

      loggers.vrchat.debug(
        `Force updated username for ${vrcUserId}: ${currentUsername}`,
      );
    }
  } catch (error) {
    loggers.vrchat.warn(
      `Failed to force update username for ${vrcUserId}`,
      error,
    );
  }
}
