import { loggers } from "../../../../utility/logger.js";

export async function handleInstanceQueueJoined(content: any) {
  // TODO: Implement instance-queue-joined event handling
  loggers.vrchat.debug("Instance Queue Joined", { content });
}
