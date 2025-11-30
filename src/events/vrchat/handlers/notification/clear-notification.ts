import { loggers } from "../../../../utility/logger.js";

export async function handleClearNotification(content: unknown) {
  // TODO: Implement clear-notification event handling
  loggers.vrchat.debug("Clear Notification", { content });
}
