import { prisma } from "../../../../main.js";
import { loggers } from "../../../../utility/logger.js";

/**
 * Handles the friend-delete event by deleting the friend location data for the given user ID.
 * @param content The event content, expected to contain userId.
 */
export async function handleFriendDelete(content: any) {
  if (!content.userId) {
    loggers.vrchat.warn("Missing userId in content", { content });
    return;
  }
  try {
    // Revoke all location tracking consents for this user
    try {
      await prisma.friendLocationConsent.deleteMany({
        where: { ownerVrcUserId: content.userId },
      });
      loggers.vrchat.info(
        `Revoked consent for userId: ${content.userId}`,
      );
    } catch (consentError) {
      loggers.vrchat.error(
        `Error revoking consent for userId: ${content.userId}`,
        consentError,
      );
    }
    // Delete all friend location records for this user
    try {
      await prisma.friendLocation.deleteMany({
        where: { vrcUserId: content.userId },
      });
      loggers.vrchat.info(
        `Deleted friend location(s) for userId: ${content.userId}`,
      );
    } catch (locationError) {
      loggers.vrchat.error(
        `Error deleting friend location(s) for userId: ${content.userId}`,
        locationError,
      );
    }
  } catch (error) {
    loggers.vrchat.error(
      `Unexpected error for userId: ${content.userId}`,
      error,
    );
  }
}
