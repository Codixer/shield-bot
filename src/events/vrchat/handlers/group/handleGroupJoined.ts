import { prisma } from "../../../../main.js";
import { groupRoleSyncManager } from "../../../../managers/groupRoleSync/groupRoleSyncManager.js";
import { loggers } from "../../../../utility/logger.js";

export async function handleGroupJoined(content: any) {
  loggers.vrchat.debug("Group Joined", { content });

  // content should have userId (VRChat user ID)
  const vrcUserId = content.userId;
  if (!vrcUserId) {
    loggers.vrchat.warn("No userId in event content");
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
    loggers.vrchat.debug(
      `No verified account found for VRChat user ${vrcUserId}`,
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
      await groupRoleSyncManager.handleGroupJoined(
        settings.guildId,
        vrcAccount.user.discordId,
        vrcUserId,
      );
    } catch (error) {
      loggers.vrchat.error(
        `Error syncing roles for guild ${settings.guildId}`,
        error,
      );
    }
  }
}
