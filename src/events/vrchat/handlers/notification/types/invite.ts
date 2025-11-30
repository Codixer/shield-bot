import { prisma } from "../../../../../main.js";
import { loggers } from "../../../../../utility/logger.js";

export async function handleInviteNotification(content: any) {
  loggers.vrchat.debug("Invite notification", { content });
  // Extract worldId from details if present
  const worldId =
    content.details?.worldId || content.worldId || "[WORLD ID NOT FOUND]";
  const senderUserId = content.senderUserId || null;
  const senderUsername =
    content.senderUsername || "[SENDER USERNAME NOT FOUND]";
  const receiverUserId =
    content.receiverUserId || "[RECEIVER USER ID NOT FOUND]";
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
  const worldName = content.details?.worldName || "[WORLD NAME NOT FOUND]";
  const sender = senderUsername || senderUserId || "[SENDER NOT FOUND]";
  loggers.vrchat.debug(
    `User has been invited to: ${worldName} (World ID: ${worldId}). This is a private instance.`,
  );
}
