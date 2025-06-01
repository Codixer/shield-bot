import { prisma } from "../../../../main.js";
import { hasFriendLocationConsent } from "../../../../utility/vrchat.js";

export async function handleFriendOnline(content: any) {
    // Ignore if the location is "travelling"
    if (content.location === "travelling") {
        return;
    }
    // Check if user has given consent for location tracking using utility method
    const consent = await hasFriendLocationConsent(content.userId);
    if (!consent) {
        console.log(`[VRChat Friend Online] No consent for user: ${content.userId}`);
        return;
    }
    // Upsert friend location event in the database
    await prisma.friendLocation.upsert({
        where: { vrcUserId: content.userId },
        update: {
            location: content.location,
            worldId: content.worldId || null,
            travelingTo: content.travelingToLocation || null,
            eventTime: new Date(),
            senderUserId: null,
        },
        create: {
            vrcUserId: content.userId,
            location: content.location,
            worldId: content.worldId || null,
            travelingTo: content.travelingToLocation || null,
            eventTime: new Date(),
            senderUserId: null,
        }
    });
    console.log("[VRChat Friend Online] Upserted:", content);
}
