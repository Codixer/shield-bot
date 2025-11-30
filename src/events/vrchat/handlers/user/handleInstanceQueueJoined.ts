import { loggers } from "../../../../utility/logger.js";

export async function handleInstanceQueueJoined(content: unknown) {
  // TODO: Implement instance-queue-joined event handling
  loggers.vrchat.debug("Instance Queue Joined", { content });
}
