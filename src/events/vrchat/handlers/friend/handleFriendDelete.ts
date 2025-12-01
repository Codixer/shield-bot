import { loggers } from "../../../../utility/logger.js";

/**
 * Handles the friend-delete event.
 * Note: Location tracking has been removed, so this handler is now a no-op.
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
  // Location tracking has been removed - this handler now does nothing
  // but is kept for backward compatibility in case it's still referenced
  loggers.vrchat.debug(
    `Friend delete event received for userId: ${typedContent.userId} (location tracking removed)`,
  );
  
}
