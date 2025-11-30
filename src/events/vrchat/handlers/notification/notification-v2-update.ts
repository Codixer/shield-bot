import { loggers } from "../../../../utility/logger.js";

export async function handleNotificationV2Update(content: unknown) {
  // TODO: Implement notification-v2-update event handling
  loggers.vrchat.debug("Notification V2 Update", { content });
}
