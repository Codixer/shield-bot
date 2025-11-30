import { loggers } from "../../../../../utility/logger.js";

export function handleRequestInviteResponseNotification(content: any) {
  loggers.vrchat.debug("RequestInviteResponse notification", { content });
  // Add requestInviteResponse specific logic here
}
