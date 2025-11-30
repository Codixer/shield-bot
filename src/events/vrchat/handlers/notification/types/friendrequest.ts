import { acceptFriendRequest } from "../../../../../utility/vrchat.js";
import { loggers } from "../../../../../utility/logger.js";

export async function handleFriendRequestNotification(content: any) {
  loggers.vrchat.debug("FriendRequest notification", { content });
  // Accept the friend request notification automatically
  if (content.id) {
    try {
      const result = await acceptFriendRequest(content.id);
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
