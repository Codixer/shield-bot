import { prisma } from "../../../../../main.js";

export async function handleInviteNotification(content: any) {
    console.log("[VRChat Notification][Invite]", content);
    // Extract worldId from details if present
    const worldId = content.details?.worldId || content.worldId || '[WORLD ID NOT FOUND]';
    const senderUserId = content.senderUserId || null;
    const senderUsername = content.senderUsername || '[SENDER USERNAME NOT FOUND]';
    const receiverUserId = content.receiverUserId || '[RECEIVER USER ID NOT FOUND]';
    // Always treat location as private for invites
    const location = 'private';
    // Store invite info in the database
    try {
        await prisma.friendLocation.upsert({
            where: { vrcUserId: receiverUserId },
            update: {
                location,
                worldId,
                eventTime: new Date(),
                senderUserId,
            },
            create: {
                vrcUserId: receiverUserId,
                location,
                worldId,
                eventTime: new Date(),
                senderUserId,
            }
        });
        console.log(`[Invite Handler] Stored invite for user ${receiverUserId} in worldId ${worldId} as private.`);
    } catch (err) {
        console.error("[Invite Handler] Failed to store invite in database:", err);
    }
    // Message for users
    const worldName = content.details?.worldName || '[WORLD NAME NOT FOUND]';
    const sender = senderUsername || senderUserId || '[SENDER NOT FOUND]';
    console.log(`[Invite Handler] You have been invited to: ${worldName} (World ID: ${worldId}). This is a private instance. Please request an invite from ${sender} instead of joining directly.`);
}

// For all other friend location events, ensure senderUserId is set to null
export async function upsertFriendLocationEvent({ vrcUserId, location, worldId, travelingTo }: { vrcUserId: string, location: string, worldId?: string, travelingTo?: string }) {
    await prisma.friendLocation.upsert({
        where: { vrcUserId },
        update: {
            location,
            worldId: worldId || null,
            travelingTo: travelingTo || null,
            eventTime: new Date(),
            senderUserId: null,
        },
        create: {
            vrcUserId,
            location,
            worldId: worldId || null,
            travelingTo: travelingTo || null,
            eventTime: new Date(),
            senderUserId: null,
        }
    });
}