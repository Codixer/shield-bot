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
        where: { vrcUserId, accountType: { in: ["UNVERIFIED", "IN_VERIFICATION"] } },
    });
    if (!vrcAccount) {
        console.log('[Friend Add] No VRChatAccount found for VRChat user:', vrcUserId);
        return;
    }
    // Try to update the verified field and set verification status to VERIFIED
    try {
        // Get VRChat username for caching
        const { getUserById } = await import("../../../../utility/vrchat.js");
        let vrchatUsername = null;
        try {
            const userInfo = await getUserById(vrcUserId);
            vrchatUsername = userInfo?.displayName || userInfo?.username;
        } catch (e) {
            console.warn(`Failed to fetch username for ${vrcUserId}:`, e);
        }

        // Determine account type based on whether user has a MAIN account
        const hasMainAccount = await prisma.vRChatAccount.findFirst({ 
            where: { userId: vrcAccount.userId, accountType: "MAIN" } 
        });
        const finalAccountType = hasMainAccount ? "ALT" : "MAIN";

        await prisma.vRChatAccount.update({
            where: { id: vrcAccount.id },
            data: { 
                accountType: finalAccountType,
                vrchatUsername,
                usernameUpdatedAt: new Date()
            }
        });
        
        console.log(`[Friend Add] Account ${vrcUserId} successfully verified and marked as VERIFIED`);
    } catch (e) {
        console.log('[Friend Add] Could not update verification status:', e);
    }
    // Fetch the Discord user by userId
    const user = await prisma.user.findUnique({ where: { id: vrcAccount.userId, } });
    if (user && user.discordId) {
        console.log(`[Friend Add] Verified VRChat account for Discord user: ${user.discordId}`);
        // Optionally, send a Discord notification here
    }
}
