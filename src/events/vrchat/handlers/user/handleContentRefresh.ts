import { loggers } from "../../../../utility/logger.js";

export async function handleContentRefresh(content: unknown) {
  // TODO: Implement content-refresh event handling
  loggers.vrchat.debug("Content Refresh", { content });
}
