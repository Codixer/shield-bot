import { prisma } from "../../../../main.js";
import { WhitelistManager } from "../../../../managers/whitelist/whitelistManager.js";
import { loggers } from "../../../../utility/logger.js";

const whitelistManager = new WhitelistManager();

interface FriendUpdateContent {
  userId?: string;
  user?: {
    displayName?: string;
    username?: string;
  };
}

export async function handleFriendUpdate(content: unknown) {
  try {
    const typedContent = content as FriendUpdateContent;
    const { userId, user } = typedContent;

    // Log the received content for debugging
    // console.log("[Friend Update] ", { userId, user });

    if (!userId || !user) {
      loggers.vrchat.warn("Missing userId or user data");
      return;
    }

    // Update username cache in verification system
    const currentUsername = user.displayName || user.username;
    if (currentUsername) {
      try {
        // Find VRChat account in verification system
        const vrcAccount = await prisma.vRChatAccount.findFirst({
          where: { vrcUserId: userId },
          include: { user: true },
        });

        if (vrcAccount) {
          // Check if username actually changed
          const usernameChanged = vrcAccount.vrchatUsername !== currentUsername;

          // Update the username cache
          await prisma.vRChatAccount.update({
            where: { id: vrcAccount.id },
            data: {
              vrchatUsername: currentUsername,
              usernameUpdatedAt: new Date(),
            },
          });

          loggers.vrchat.debug(
            `Updated username for ${userId}: ${currentUsername}`,
          );

          // If username changed, update whitelist repository
          if (usernameChanged) {
            try {
              const oldUsername = vrcAccount.vrchatUsername || 'unknown';
              const msg = `Username updated: ${oldUsername} → ${currentUsername}`;
              whitelistManager.queueBatchedUpdate(userId, msg);
              loggers.vrchat.info(
                `Queued whitelist repository update due to username change for ${userId}`,
              );
            } catch (repoError) {
              loggers.vrchat.warn(
                `Failed to queue whitelist repository update for ${userId}`,
                repoError,
              );
            }
          }
        }
      } catch (error) {
        loggers.vrchat.error(
          `Error updating username cache for ${userId}`,
          error,
        );
      }
    }
  } catch (error) {
    loggers.vrchat.error("Error processing friend update", error);
  }
}
