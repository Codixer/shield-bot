import { prisma } from "../../../../main.js";
import { loggers } from "../../../../utility/logger.js";

/**
 * Handles the friend-delete event by deleting the friend location data for the given user ID.
 * @param content The event content, expected to contain userId.
 */
interface FriendDeleteContent {
  userId?: string;
}

export async function handleFriendDelete(content: unknown) {
  const typedContent = content as FriendDeleteContent;
  if (!typedContent.userId) {
    loggers.vrchat.warn("Missing userId in content", { content });
    return;
  }
  try {
    // Revoke all location tracking consents for this user
    try {
      await prisma.friendLocationConsent.deleteMany({
        where: { ownerVrcUserId: typedContent.userId },
      });
      loggers.vrchat.info(
        `Revoked consent for userId: ${typedContent.userId}`,
      );
    } catch (consentError) {
      loggers.vrchat.error(
        `Error revoking consent for userId: ${typedContent.userId}`,
        consentError,
      );
    }
    // Delete all friend location records for this user
    try {
      await prisma.friendLocation.deleteMany({
        where: { vrcUserId: typedContent.userId },
      });
      loggers.vrchat.info(
        `Deleted friend location(s) for userId: ${typedContent.userId}`,
      );
    } catch (locationError) {
      loggers.vrchat.error(
        `Error deleting friend location(s) for userId: ${typedContent.userId}`,
        locationError,
      );
    }
  } catch (error) {
    loggers.vrchat.error(
      `Unexpected error for userId: ${typedContent.userId}`,
      error,
    );
  }
}
