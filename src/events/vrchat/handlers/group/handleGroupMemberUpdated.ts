import { prisma, bot } from "../../../../main.js";
import { EmbedBuilder, Colors, TextChannel } from "discord.js";
import { getGroupMember, getGroupRoles } from "../../../../utility/vrchat/groups.js";

export async function handleGroupMemberUpdated(content: any) {
  console.log("[Group Member Updated]", content);

  // content should have userId (VRChat user ID) and groupId
  const vrcUserId = content.userId;
  const groupId = content.groupId;

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

  // Find all guilds with this VRChat group ID configured
  const guildSettings = await prisma.guildSettings.findMany({
    where: {
      vrcGroupId: groupId || { not: null },
    },
  });

  // Fetch current group member info and roles
  let groupMember: any = null;
  let allRoles: any[] = [];
  let currentRoleNames: string[] = [];

  if (groupId) {
    try {
      groupMember = await getGroupMember(groupId, vrcUserId);
      allRoles = await getGroupRoles(groupId);

      // Map role IDs to names
      const roleMap = new Map(allRoles.map((r: any) => [r.id, r.name]));
      const memberRoleIds = [
        ...(groupMember?.roleIds || []),
        ...(groupMember?.mRoleIds || []),
      ];
      currentRoleNames = memberRoleIds
        .map((id) => roleMap.get(id))
        .filter((name) => name !== undefined);
    } catch (error) {
      console.error(
        "[Group Member Updated] Error fetching role information:",
        error,
      );
    }
  }

  const vrcUsername = vrcAccount.vrchatUsername || vrcUserId;
  const vrcUserLink = `[${vrcUsername}](https://vrchat.com/home/user/${vrcUserId})`;

  // Log to promotion logs channel for each configured guild
  for (const settings of guildSettings) {
    if (!settings.botPromotionLogsChannelId) continue;

    try {
      const guild = await bot.guilds.fetch(settings.guildId).catch(() => null);
      if (!guild) continue;

      const member = await guild.members
        .fetch(vrcAccount.user.discordId)
        .catch(() => null);

      const channel = (await bot.channels.fetch(
        settings.botPromotionLogsChannelId,
      )) as TextChannel;
      if (!channel || !channel.isTextBased()) {
        console.warn(
          `[Group Member Updated] Invalid promotion logs channel ${settings.botPromotionLogsChannelId}`,
        );
        continue;
      }

      const rolesText =
        currentRoleNames.length > 0
          ? currentRoleNames.map((name) => `• ${name}`).join("\n")
          : "_No roles assigned_";

      // Log the role change event
      const embed = new EmbedBuilder()
        .setTitle("🔄 VRChat Group Roles Updated")
        .setDescription(
          `${member ? `<@${member.id}>` : vrcUsername}'s roles were updated in the VRChat group by a group admin.`,
        )
        .addFields(
          {
            name: "Discord Member",
            value: member ? `<@${member.id}>` : "_Not in server_",
            inline: true,
          },
          { name: "VRChat User", value: vrcUserLink, inline: true },
          {
            name: "Current VRChat Roles",
            value: rolesText,
            inline: false,
          },
          {
            name: "ℹ️ Note",
            value:
              "This change was made directly in VRChat by a group administrator. To keep Discord and VRChat roles in sync, use `/group rolesync` to update VRChat roles based on their Discord roles.",
            inline: false,
          },
        )
        .setColor(Colors.Gold)
        .setTimestamp()
        .setFooter({ text: "S.H.I.E.L.D. Bot - Group Role Sync" });

      await channel.send({ embeds: [embed] });
      console.log(
        `[Group Member Updated] Logged role update for ${vrcUsername} in guild ${settings.guildId}`,
      );
    } catch (error) {
      console.error(
        `[Group Member Updated] Error logging for guild ${settings.guildId}:`,
        error,
      );
    }
  }
}
