import { loggers } from "../../../../../utility/logger.js";

export function handleRequestInviteNotification(content: any) {
  loggers.vrchat.debug("RequestInvite notification", { content });
  // Add requestInvite specific logic here
}
