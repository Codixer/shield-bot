// responseNotificationHandler.ts

import { loggers } from "../../../../../utility/logger.js";

export async function handleResponseNotification(content: any) {
  // TODO: Implement response-notification event handling
  loggers.vrchat.debug("Response Notification", { content });
}
