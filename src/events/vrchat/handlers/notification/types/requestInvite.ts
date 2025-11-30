import { loggers } from "../../../../../utility/logger.js";

export function handleRequestInviteNotification(content: unknown) {
  loggers.vrchat.debug("RequestInvite notification", { content });
  // Add requestInvite specific logic here
}
