import { prisma } from "../../../../main.js";
import { hasFriendLocationConsent } from "../../../../utility/vrchat.js";

export async function handleFriendOffline(content: any) {
    // Upsert friend location event in the database as offline

    // Check if user has given consent for location tracking using utility method
    const consent = await hasFriendLocationConsent(content.userId);
    if (!consent) {
        console.log(`[VRChat Friend Online] No consent for user: ${content.userId}`);
        return;
    }

    await prisma.friendLocation.upsert({
        where: { vrcUserId: content.userId },
        update: {
            location: "offline", // always just the instanceId or special value
            worldId: "offline",
            travelingTo: null,
            eventTime: new Date(),
            senderUserId: null,
        },
        create: {
            vrcUserId: content.userId,
            location: "offline",
            worldId: "offline",
            travelingTo: null,
            eventTime: new Date(),
            senderUserId: null,
        }
    });
    console.log("[VRChat Friend Offline] Upserted as offline:", content);
}
