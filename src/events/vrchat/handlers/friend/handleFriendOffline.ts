import { prisma } from "../../../../main.js";

export async function handleFriendOffline(content: any) {
    // Upsert friend location event in the database as offline
    await prisma.friendLocation.upsert({
        where: { vrcUserId: content.userId },
        update: {
            location: "offline",
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
