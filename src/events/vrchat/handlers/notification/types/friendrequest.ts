import { acceptFriendRequest } from "../../../../../utility/vrchat.js";
import { loggers } from "../../../../../utility/logger.js";

export async function handleFriendRequestNotification(content: unknown) {
  loggers.vrchat.debug("FriendRequest notification", { content });
  // Accept the friend request notification automatically
  const typedContent = content as { id?: string };
  if (typedContent.id) {
    try {
      const result = await acceptFriendRequest(typedContent.id);
      loggers.vrchat.info("FriendRequest accepted", { result });
    } catch (error) {
      loggers.vrchat.error(
        "FriendRequest accept error",
        error,
      );
    }
  } else {
    loggers.vrchat.warn(
      "Missing notification id or authToken",
      { content },
    );
  }
}
