import { prisma, bot } from "../../../../main.js";
import { EmbedBuilder, Colors, TextChannel } from "discord.js";
import { getGroupMember, getGroupRoles } from "../../../../utility/vrchat/groups.js";

export async function handleGroupMemberUpdated(content: any) {
  console.log("[Group Member Updated] Event received:", content);

  // content should have userId (VRChat user ID) and groupId
  const vrcUserId = content.userId;
  const groupId = content.groupId;

  if (!vrcUserId) {
    console.warn("[Group Member Updated] ❌ No userId in event content - skipping");
    return;
  }

  console.log(`[Group Member Updated] Processing update for VRChat user: ${vrcUserId}`);
  if (groupId) {
    console.log(`[Group Member Updated] Group ID: ${groupId}`);
  } else {
    console.log(`[Group Member Updated] ⚠️ No groupId in event content`);
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
      `[Group Member Updated] ❌ No verified account found for VRChat user ${vrcUserId} - user not verified in bot database`,
    );
    return;
  }

  console.log(
    `[Group Member Updated] ✅ Found verified account for ${vrcAccount.vrchatUsername || vrcUserId} (Discord: ${vrcAccount.user.discordId})`,
  );

  // Find all guilds with this VRChat group ID configured
  const guildSettings = await prisma.guildSettings.findMany({
    where: {
      vrcGroupId: groupId || { not: null },
    },
  });

  if (guildSettings.length === 0) {
    console.log(
      `[Group Member Updated] ❌ No guilds found with VRChat group ${groupId || "any"} configured - no promotion logs channels to send to`,
    );
    return;
  }

  console.log(
    `[Group Member Updated] Found ${guildSettings.length} guild(s) with this VRChat group configured`,
  );

  // Fetch current group member info and roles
  let groupMember: any = null;
  let allRoles: any[] = [];
  let currentRoleNames: string[] = [];

  if (groupId) {
    try {
      console.log(`[Group Member Updated] Fetching group member and roles info...`);
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
      
      console.log(
        `[Group Member Updated] Member has ${currentRoleNames.length} role(s): ${currentRoleNames.join(", ") || "none"}`,
      );
    } catch (error) {
      console.error(
        "[Group Member Updated] ❌ Error fetching role information:",
        error,
      );
    }
  } else {
    console.log(
      "[Group Member Updated] ⚠️ Skipping role fetch - no groupId available",
    );
  }

  const vrcUsername = vrcAccount.vrchatUsername || vrcUserId;
  const vrcUserLink = `[${vrcUsername}](https://vrchat.com/home/user/${vrcUserId})`;

  // Log to promotion logs channel for each configured guild
  for (const settings of guildSettings) {
    if (!settings.botPromotionLogsChannelId) {
      console.log(
        `[Group Member Updated] ⚠️ Guild ${settings.guildId} has no promotion logs channel configured - skipping`,
      );
      continue;
    }

    try {
      console.log(
        `[Group Member Updated] Processing log for guild ${settings.guildId}...`,
      );
      
      const guild = await bot.guilds.fetch(settings.guildId).catch(() => null);
      if (!guild) {
        console.log(
          `[Group Member Updated] ❌ Guild ${settings.guildId} not found or bot not in guild - skipping`,
        );
        continue;
      }

      const member = await guild.members
        .fetch(vrcAccount.user.discordId)
        .catch(() => null);
      
      if (!member) {
        console.log(
          `[Group Member Updated] ⚠️ Discord member ${vrcAccount.user.discordId} not found in guild ${settings.guildId}`,
        );
      }

      const channel = (await bot.channels.fetch(
        settings.botPromotionLogsChannelId,
      )) as TextChannel;
      if (!channel || !channel.isTextBased()) {
        console.warn(
          `[Group Member Updated] ❌ Invalid promotion logs channel ${settings.botPromotionLogsChannelId} in guild ${settings.guildId} - skipping`,
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
        `[Group Member Updated] ✅ Successfully logged role update for ${vrcUsername} in guild ${settings.guildId}`,
      );
    } catch (error) {
      console.error(
        `[Group Member Updated] ❌ Error logging for guild ${settings.guildId}:`,
        error,
      );
    }
  }
  
  console.log(
    `[Group Member Updated] ✅ Completed processing for ${vrcUsername}`,
  );
}
