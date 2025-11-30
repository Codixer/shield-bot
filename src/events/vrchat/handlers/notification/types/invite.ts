import { prisma } from "../../../../../main.js";
import { loggers } from "../../../../../utility/logger.js";

interface InviteNotificationContent {
  details?: { worldId?: string; worldName?: string };
  worldId?: string;
  senderUserId?: string;
  senderUsername?: string;
  receiverUserId?: string;
}

export async function handleInviteNotification(content: unknown) {
  loggers.vrchat.debug("Invite notification", { content });
  const typedContent = content as InviteNotificationContent;
  // Extract worldId from details if present
  const worldId =
    typedContent.details?.worldId || typedContent.worldId || "[WORLD ID NOT FOUND]";
  const senderUserId = typedContent.senderUserId;
  if (!senderUserId) {
    loggers.vrchat.warn("Invite notification missing senderUserId");
    return;
  }
  const receiverUserId =
    typedContent.receiverUserId || "[RECEIVER USER ID NOT FOUND]";
  // Always treat location as private for invites
  const location = "private";
  // Store invite info in the database
  try {
    await prisma.friendLocation.upsert({
      where: { vrcUserId: senderUserId },
      update: {
        location, // always 'private' for invites
        worldId,
        eventTime: new Date(),
        senderUserId,
      },
      create: {
        vrcUserId: senderUserId,
        location, // always 'private' for invites
        worldId,
        eventTime: new Date(),
        senderUserId,
      },
    });
    loggers.vrchat.info(
      `Stored invite for user ${receiverUserId} in worldId ${worldId} as private.`,
    );
  } catch (err) {
    loggers.vrchat.error("Failed to store invite in database", err);
  }
  // Message for users
  const worldName = typedContent.details?.worldName || "[WORLD NAME NOT FOUND]";
  loggers.vrchat.debug(
    `User has been invited to: ${worldName} (World ID: ${worldId}). This is a private instance.`,
  );
}
