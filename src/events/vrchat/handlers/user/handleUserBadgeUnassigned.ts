import { loggers } from "../../../../utility/logger.js";

export async function handleUserBadgeUnassigned(content: any) {
  // TODO: Implement user-badge-unassigned event handling
  loggers.vrchat.debug("User Badge Unassigned", { content });
}
