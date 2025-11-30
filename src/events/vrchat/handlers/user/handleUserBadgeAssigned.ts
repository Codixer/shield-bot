import { loggers } from "../../../../utility/logger.js";

export async function handleUserBadgeAssigned(content: unknown) {
  // TODO: Implement user-badge-assigned event handling
  loggers.vrchat.debug("User Badge Assigned", { content });
}
