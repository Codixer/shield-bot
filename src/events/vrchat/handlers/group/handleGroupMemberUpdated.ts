import { prisma } from "../../../../main.js";
import { groupRoleSyncManager } from "../../../../managers/groupRoleSync/groupRoleSyncManager.js";

export async function handleGroupMemberUpdated(content: any) {
  console.log("[Group Member Updated]", content);

  // content should have userId (VRChat user ID)
  const vrcUserId = content.userId;
  if (!vrcUserId) {
    console.warn("[Group Member Updated] No userId in event content");
    return;
  }

  // Find the verified VRChat account in our database
  const vrcAccount = await prisma.vRChatAccount.findFirst({
    where: {
      vrcUserId,
      accountType: { in: ["MAIN", "ALT"] },
    },
    include: { user: true },
  });

  if (!vrcAccount || !vrcAccount.user) {
    console.log(
      `[Group Member Updated] No verified account found for VRChat user ${vrcUserId}`,
    );
    return;
  }

  // Find all guilds with VRChat group ID configured
  const guildSettings = await prisma.guildSettings.findMany({
    where: {
      vrcGroupId: { not: null },
    },
  });

  // Sync roles for each configured guild
  for (const settings of guildSettings) {
    if (!settings.vrcGroupId) continue;

    try {
      await groupRoleSyncManager.handleGroupMemberUpdated(
        settings.guildId,
        vrcAccount.user.discordId,
        vrcUserId,
      );
    } catch (error) {
      console.error(
        `[Group Member Updated] Error syncing roles for guild ${settings.guildId}:`,
        error,
      );
    }
  }
}
