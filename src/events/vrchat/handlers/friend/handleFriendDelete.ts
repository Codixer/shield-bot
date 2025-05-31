import { prisma } from "../../../../main.js";

/**
 * Handles the friend-delete event by deleting the friend location data for the given user ID.
 * @param content The event content, expected to contain userId.
 */
export async function handleFriendDelete(content: any) {
    if (!content.userId) {
        console.warn("[VRChat Friend Delete] Missing userId in content", content);
        return;
    }
    try {
        await prisma.friendLocation.delete({
            where: { vrcUserId: content.userId }
        });
        console.log(`[VRChat Friend Delete] Deleted friend location for userId: ${content.userId}`);
    } catch (error) {
        console.error(`[VRChat Friend Delete] Error deleting friend location for userId: ${content.userId}`, error);
    }
}
