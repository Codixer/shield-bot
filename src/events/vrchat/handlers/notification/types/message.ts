import { loggers } from "../../../../../utility/logger.js";

export function handleMessageNotification(content: unknown) {
  loggers.vrchat.debug("Message notification", { content });
  // Add message specific logic here
}
