import { prisma } from "../../../../main.js";
import { groupRoleSyncManager } from "../../../../managers/groupRoleSync/groupRoleSyncManager.js";

export async function handleGroupLeft(content: any) {
  console.log("[Group Left]", content);

  // content should have userId (VRChat user ID)
  const vrcUserId = content.userId;
  if (!vrcUserId) {
    console.warn("[Group Left] No userId in event content");
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
      `[Group Left] No verified account found for VRChat user ${vrcUserId}`,
    );
    return;
  }

  // Find all guilds with VRChat group ID configured
  const guildSettings = await prisma.guildSettings.findMany({
    where: {
      vrcGroupId: { not: null },
    },
  });

  // Log the leave for each configured guild
  for (const settings of guildSettings) {
    if (!settings.vrcGroupId) continue;

    try {
      await groupRoleSyncManager.handleGroupLeft(
        settings.guildId,
        vrcAccount.user.discordId,
        vrcUserId,
      );
    } catch (error) {
      console.error(
        `[Group Left] Error logging group leave for guild ${settings.guildId}:`,
        error,
      );
    }
  }
}
