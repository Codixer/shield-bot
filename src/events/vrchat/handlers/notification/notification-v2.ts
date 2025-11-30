import { loggers } from "../../../../utility/logger.js";

export async function handleNotificationV2(content: unknown) {
  // TODO: Implement notification-v2 event handling
  loggers.vrchat.debug("Notification V2", { content });
}
