import { prisma } from "../../../../main.js";
import { hasFriendLocationConsent } from "../../../../utility/vrchat.js";
import { updateUsernameCache } from "../../../../utility/vrchat/usernameCache.js";

export async function handleFriendLocation(content: any) {
  // Ignore if the location is "travelling"
  if (content.location === "travelling") {
    return;
  }

  // Update username cache for this user (if it's been a week or more)
  if (content.userId) {
    updateUsernameCache(content.userId).catch((e) =>
      console.warn(
        `[Friend Location] Username cache update failed for ${content.userId}:`,
        e,
      ),
    );
  }

  // Check consent: only track if the user has allowed the sender to track them
  if (content.userId) {
    const consent = await hasFriendLocationConsent(content.userId);
    if (!consent) {
      // console.log(`[Friend Location] No consent: Not allowed to track ${content.userId}`);
      return;
    }
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
    "[VRChat Friend Location] Upserted:",
    content.userId,
    instanceId,
    worldId,
  );
}
