import { prisma } from "../../../../main.js";
import { hasFriendLocationConsent } from "../../../../utility/vrchat.js";
import { updateUsernameCache } from "../../../../utility/vrchat/usernameCache.js";

export async function handleFriendOnline(content: any) {
  // Ignore if the location is "travelling"
  if (content.location === "travelling") {
    return;
  }

  // Update username cache for this user (if it's been a week or more)
  if (content.userId) {
    updateUsernameCache(content.userId).catch((e) =>
      console.warn(
        `[Friend Online] Username cache update failed for ${content.userId}:`,
        e,
      ),
    );
  }

  // Check if user has given consent for location tracking using utility method
  const consent = await hasFriendLocationConsent(content.userId);
  if (!consent) {
    // console.log(`[VRChat Friend Online] No consent for user: ${content.userId}`);
    return;
  }
  // Extract instanceId and worldId
  let instanceId = content.location;
  let worldId = content.worldId || null;
  if (content.location && content.location.includes(":")) {
    const parts = content.location.split(":");
    worldId = parts[0];
    instanceId = parts[1];
  }
  // Upsert friend location event in the database
  await prisma.friendLocation.upsert({
    where: { vrcUserId: content.userId },
    update: {
      location: instanceId,
      worldId: worldId,
      travelingTo: content.travelingToLocation || null,
      eventTime: new Date(),
      senderUserId: null,
    },
    create: {
      vrcUserId: content.userId,
      location: instanceId,
      worldId: worldId,
      travelingTo: content.travelingToLocation || null,
      eventTime: new Date(),
      senderUserId: null,
    },
  });
  console.log(
    "[VRChat Friend Online] Upserted:",
    content.userId,
    instanceId,
    worldId,
  );
}
