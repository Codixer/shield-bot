import { prisma } from "../../../../main.js";

export async function handleFriendActive(content: any) {
    // Upsert friend location event in the database as offline (per instructions)
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
    console.log("[VRChat Friend Active] Upserted as offline:", content);
}
