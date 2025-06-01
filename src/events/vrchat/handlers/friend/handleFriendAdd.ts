import { prisma } from '../../../../main.js';

export async function handleFriendAdd(content: any) {
    // content should include the VRChat user ID of the new friend
    const vrcUserId = content.userId || content.id;
    if (!vrcUserId) {
        console.log('[Friend Add] No VRChat user ID found in event:', content);
        return;
    }
    // Find the VRChatAccount in the database (pending verification)
    const vrcAccount = await prisma.vRChatAccount.findFirst({
        where: { vrcUserId },
    });
    if (!vrcAccount) {
        console.log('[Friend Add] No VRChatAccount found for VRChat user:', vrcUserId);
        return;
    }
    // Try to update the verified field if it exists
    try {
        await prisma.vRChatAccount.update({
            where: { id: vrcAccount.id },
            data: { verified: true }
        });
    } catch (e) {
        console.log('[Friend Add] Could not update verified field (may not exist):', e);
    }
    // Fetch the Discord user by userId
    const user = await prisma.user.findUnique({ where: { id: vrcAccount.userId } });
    if (user && user.discordId) {
        console.log(`[Friend Add] Verified VRChat account for Discord user: ${user.discordId}`);
        // Optionally, send a Discord notification here
    }
}
