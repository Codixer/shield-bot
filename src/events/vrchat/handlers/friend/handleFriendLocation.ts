import { prisma } from "../../../../main.js";
import { hasFriendLocationConsent } from "../../../../utility/vrchat.js";
import { updateUsernameCache } from "../../../../utility/vrchat/usernameCache.js";
import { loggers } from "../../../../utility/logger.js";

interface FriendLocationContent {
  userId?: string;
  location?: string;
  worldId?: string;
  travelingToLocation?: string;
}

export async function handleFriendLocation(content: unknown) {
  const typedContent = content as FriendLocationContent;
  // Ignore if the location is "travelling"
  if (typedContent.location === "travelling") {
    return;
  }

  // Update username cache for this user (if it's been a week or more)
  if (typedContent.userId) {
    updateUsernameCache(typedContent.userId).catch((e) =>
      loggers.vrchat.warn(
        `Username cache update failed for ${typedContent.userId}`,
        e,
      ),
    );
  }

  // Check consent: only track if the user has allowed the sender to track them
  if (typedContent.userId) {
    const consent = await hasFriendLocationConsent(typedContent.userId);
    if (!consent) {
      // console.log(`[Friend Location] No consent: Not allowed to track ${typedContent.userId}`);
      return;
    }
  }
  // Extract instanceId and worldId
  let instanceId = typedContent.location;
  let worldId: string | null = typedContent.worldId || null;
  if (typedContent.location && typedContent.location.includes(":")) {
    const parts = typedContent.location.split(":");
    worldId = parts[0] || null;
    instanceId = parts[1];
  }
  // Upsert friend location event in the database
  await prisma.friendLocation.upsert({
    where: { vrcUserId: typedContent.userId || "" },
    update: {
      location: instanceId || undefined,
      worldId: worldId,
      travelingTo: typedContent.travelingToLocation || null,
      eventTime: new Date(),
      senderUserId: null,
    },
    create: {
      vrcUserId: typedContent.userId || "",
      location: instanceId || "",
      worldId: worldId,
      travelingTo: typedContent.travelingToLocation || null,
      eventTime: new Date(),
      senderUserId: null,
    },
  });
  loggers.vrchat.debug(
    `Upserted friend location: ${typedContent.userId}, ${instanceId}, ${worldId}`,
  );
}
