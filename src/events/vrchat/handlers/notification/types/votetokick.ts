import { loggers } from "../../../../../utility/logger.js";

export function handleVoteToKickNotification(content: unknown) {
  loggers.vrchat.debug("VoteToKick notification", { content });
  // Add votetokick specific logic here
}
