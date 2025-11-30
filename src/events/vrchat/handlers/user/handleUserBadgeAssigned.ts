import { loggers } from "../../../../utility/logger.js";

export async function handleUserBadgeAssigned(content: any) {
  // TODO: Implement user-badge-assigned event handling
  loggers.vrchat.debug("User Badge Assigned", { content });
}
