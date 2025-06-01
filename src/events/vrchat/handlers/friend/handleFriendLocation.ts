import { prisma } from "../../../../main.js";
import { hasFriendLocationConsent } from "../../../../utility/vrchat.js";

export async function handleFriendLocation(content: any) {
    // Ignore if the location is "travelling"
    if (content.location === "travelling") {
        return;
    }
    // Check consent: only track if the user has allowed the sender to track them
    if (content.userId) {
        const consent = await hasFriendLocationConsent(content.userId);
        if (!consent) {
            console.log(`[Friend Location] No consent: Not allowed to track ${content.userId}`);
            return;
        }
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
    console.log("[VRChat Friend Location] Upserted:", content);
}
