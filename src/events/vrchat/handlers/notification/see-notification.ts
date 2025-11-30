import { loggers } from "../../../../utility/logger.js";

export async function handleSeeNotification(content: unknown) {
  // TODO: Implement see-notification event handling
  loggers.vrchat.debug("See Notification", { content });
}
