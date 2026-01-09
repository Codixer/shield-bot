import { loggers } from "../../../../../utility/logger.js";

interface InviteNotificationContent {
  details?: { worldId?: string; worldName?: string };
  worldId?: string;
}

export async function handleInviteNotification(content: unknown) {
  loggers.vrchat.debug("Invite notification", { content });
  const typedContent = content as InviteNotificationContent;
  // Extract worldId from details if present
  const worldId =
    typedContent.details?.worldId || typedContent.worldId || "[WORLD ID NOT FOUND]";
  const worldName = typedContent.details?.worldName || "[WORLD NAME NOT FOUND]";
  loggers.vrchat.debug(
    `User has been invited to: ${worldName} (World ID: ${worldId}). This is a private instance.`,
  );
}
