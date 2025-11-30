import { prisma } from "../../../../main.js";
import { hasFriendLocationConsent } from "../../../../utility/vrchat.js";
import { updateUsernameCache } from "../../../../utility/vrchat/usernameCache.js";
import { loggers } from "../../../../utility/logger.js";

interface FriendOfflineContent {
  userId?: string;
}

export async function handleFriendOffline(content: unknown) {
  const typedContent = content as FriendOfflineContent;
  // Update username cache for this user (if it's been a week or more)
  if (typedContent.userId) {
    updateUsernameCache(typedContent.userId).catch((e) =>
      loggers.vrchat.warn(
        `Username cache update failed for ${typedContent.userId}`,
        e,
      ),
    );
  }

  // Upsert friend location event in the database as offline

  // Check if user has given consent for location tracking using utility method
  const consent = await hasFriendLocationConsent(typedContent.userId || "");
  if (!consent) {
    // console.log(`[VRChat Friend Online] No consent for user: ${typedContent.userId}`);
    return;
  }

  await prisma.friendLocation.upsert({
    where: { vrcUserId: typedContent.userId || "" },
    update: {
      location: "offline", // always just the instanceId or special value
      worldId: "offline",
      travelingTo: null,
      eventTime: new Date(),
      senderUserId: null,
    },
    create: {
      vrcUserId: typedContent.userId || "",
      location: "offline",
      worldId: "offline",
      travelingTo: null,
      eventTime: new Date(),
      senderUserId: null,
    },
  });
  loggers.vrchat.debug(`Upserted friend offline: ${typedContent.userId}`);
}
