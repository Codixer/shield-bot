import { prisma } from "../../../../main.js";

export async function handleFriendLocation(content: any) {
    // Ignore if the location is "travelling"
    if (content.location === "travelling") {
        return;
    }
    // Try to upsert friend location event in the database
    await prisma.friendLocation.upsert({
        // Replace 'id' with the correct unique identifier field if needed
        where: { vrcUserId: content.userId },
        update: {
            location: content.location,
            worldId: content.worldId || null,
            travelingTo: content.travelingToLocation || null,
            eventTime: new Date()
        },
        create: {
            vrcUserId: content.userId,
            location: content.location,
            worldId: content.worldId || null,
            travelingTo: content.travelingToLocation || null,
            eventTime: new Date()
        }
    });
    console.log("[VRChat Friend Location] Upserted:", content);
}
