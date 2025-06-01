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
        // Revoke all location tracking consents for this user
        try {
            await prisma.friendLocationConsent.deleteMany({ where: { ownerVrcUserId: content.userId } });
            console.log(`[VRChat Friend Delete] Revoked consent for userId: ${content.userId}`);
        } catch (consentError) {
            console.error(`[VRChat Friend Delete] Error revoking consent for userId: ${content.userId}`, consentError);
        }
        // Delete all friend location records for this user
        try {
            await prisma.friendLocation.deleteMany({ where: { vrcUserId: content.userId } });
            console.log(`[VRChat Friend Delete] Deleted friend location(s) for userId: ${content.userId}`);
        } catch (locationError) {
            console.error(`[VRChat Friend Delete] Error deleting friend location(s) for userId: ${content.userId}`, locationError);
        }
    } catch (error) {
        console.error(`[VRChat Friend Delete] Unexpected error for userId: ${content.userId}`, error);
    }
}
