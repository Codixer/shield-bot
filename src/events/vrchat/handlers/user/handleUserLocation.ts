import { loggers } from "../../../../utility/logger.js";

export async function handleUserLocation(content: any) {
  // TODO: Implement user-location event handling
  loggers.vrchat.debug("User Location", { content });
}
