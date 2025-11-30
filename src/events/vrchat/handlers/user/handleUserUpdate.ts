import { loggers } from "../../../../utility/logger.js";

export async function handleUserUpdate(content: unknown) {
  // TODO: Implement user-update event handling
  loggers.vrchat.debug("User Update", { content });
}
