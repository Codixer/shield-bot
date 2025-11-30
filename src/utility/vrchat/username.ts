import { prisma } from "../../main.js";
import { getUserById } from "./user.js";
import { forceUpdateUsernameCache } from "./usernameCache.js";
import { loggers } from "../logger.js";

/**
 * Get VRChat username, preferring cached version but updating if needed
 */
export async function getVRChatUsername(
  vrcUserId: string,
): Promise<string | null> {
  try {
    // First check if we have a cached username
    const vrcAccount = await prisma.vRChatAccount.findFirst({
      where: { vrcUserId },
    });

    if (vrcAccount && vrcAccount.vrchatUsername) {
      // Check if cache is fresh (less than a week old)
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      if (
        vrcAccount.usernameUpdatedAt &&
        vrcAccount.usernameUpdatedAt > oneWeekAgo
      ) {
        return vrcAccount.vrchatUsername;
      }
    }

    // Cache is stale or doesn't exist, fetch from API
    const userInfo = await getUserById(vrcUserId);
    const username = userInfo?.displayName || userInfo?.username;

    if (username && vrcAccount) {
      // Update cache
      await prisma.vRChatAccount.update({
        where: { id: vrcAccount.id },
        data: {
          vrchatUsername: username,
          usernameUpdatedAt: new Date(),
        },
      });
    }

    return username || null;
  } catch (error) {
    loggers.vrchat.warn(
      `Failed to get username for ${vrcUserId}`,
      error,
    );
    return null;
  }
}

/**
 * Get VRChat username with forced refresh (ignores cache)
 */
export async function getVRChatUsernameFresh(
  vrcUserId: string,
): Promise<string | null> {
  try {
    await forceUpdateUsernameCache(vrcUserId);

    const vrcAccount = await prisma.vRChatAccount.findFirst({
      where: { vrcUserId },
    });

    return vrcAccount?.vrchatUsername || null;
  } catch (error) {
    loggers.vrchat.warn(
      `Failed to get fresh username for ${vrcUserId}`,
      error,
    );
    return null;
  }
}
