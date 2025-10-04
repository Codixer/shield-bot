import { Discord, Slash, Guard, SlashGroup } from "discordx";
import {
  CommandInteraction,
  MessageFlags,
  InteractionContextType,
  ApplicationIntegrationType,
  ChannelType,
} from "discord.js";
import { AttendanceManager } from "../../managers/attendance/attendanceManager.js";
import { AttendanceHostGuard } from "../../utility/guards.js";
import { prisma } from "../../main.js";
import {
  getUserPermissionLevelFromRoles,
  PermissionLevel,
  userHasSpecificRole,
} from "../../utility/permissionUtils.js";

const attendanceManager = new AttendanceManager();

@Discord()
@SlashGroup({
  name: "attendance",
  description: "VRChat attendance tracking commands.",
  contexts: [InteractionContextType.Guild],
  integrationTypes: [ApplicationIntegrationType.GuildInstall],
})
@SlashGroup("attendance")
@Guard(AttendanceHostGuard)
export class VRChatAttendanceAutofillCommand {
  @Slash({
    name: "autofill",
    description:
      "Auto-fill attendance based on voice channel presence in patrol category.",
  })
  async autofill(interaction: CommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.guild) {
      await interaction.editReply({
        content: "This command can only be used in a server.",
      });
      return;
    }

    // Get guild settings
    const settings = await prisma.guildSettings.findUnique({
      where: { guildId: interaction.guildId! },
    });

    if (!settings?.patrolChannelCategoryId) {
      await interaction.editReply({
        content:
          "Patrol category is not configured. Please configure it in the guild settings first.",
      });
      return;
    }

    const patrolCategoryId = settings.patrolChannelCategoryId;

    // Get all voice channels in the patrol category
    const guild = interaction.guild;
    const patrolCategory = guild.channels.cache.get(patrolCategoryId);

    if (!patrolCategory || patrolCategory.type !== ChannelType.GuildCategory) {
      await interaction.editReply({
        content:
          "Patrol category not found or is not a valid category channel.",
      });
      return;
    }

    // Get all voice channels in the category
    const voiceChannels = guild.channels.cache.filter(
      (channel) =>
        channel.parentId === patrolCategoryId &&
        channel.type === ChannelType.GuildVoice,
    );

    if (voiceChannels.size === 0) {
      await interaction.editReply({
        content: "No voice channels found in the patrol category.",
      });
      return;
    }

    // Check if user has an active event
    const user = await attendanceManager.findOrCreateUserByDiscordId(
      interaction.user.id,
    );
    let eventId = await attendanceManager.getActiveEventIdForUser(user.id);
    let event;

    // Create event if none exists
    if (!eventId) {
      event = await attendanceManager.createEvent(new Date(), user.id);
      eventId = event.id;
      await attendanceManager.setActiveEventForUser(user.id, eventId);
    } else {
      event = await attendanceManager.getEventById(eventId);
    }

    if (!event) {
      await interaction.editReply({
        content: "Failed to get or create event.",
      });
      return;
    }

    // Get current squad members to track changes
    const existingSquads = await prisma.squad.findMany({
      where: { eventId },
      include: {
        members: {
          include: { user: true },
        },
      },
    });

    // Create a map of current members and their squads
    const currentMemberSquads = new Map<string, string>(); // discordId -> squadChannelId
    for (const squad of existingSquads) {
      for (const member of squad.members) {
        if (!member.hasLeft) {
          currentMemberSquads.set(member.user.discordId, squad.name);
        }
      }
    }

    // Process voice channels and their members
    const processedUsers = new Set<string>();
    const newMemberSquads = new Map<string, string>(); // discordId -> squadChannelId
    let addedCount = 0;
    let splitCount = 0;
    let staffCount = 0;

    for (const [channelId, channel] of voiceChannels) {
      if (channel.type !== ChannelType.GuildVoice) continue;

      const members = channel.members;

      for (const [memberId, member] of members) {
        processedUsers.add(memberId);
        newMemberSquads.set(memberId, channelId);

        const dbUser = await attendanceManager.findOrCreateUserByDiscordId(
          memberId,
        );

        const previousSquad = currentMemberSquads.get(memberId);

        // Check if user has the specific STAFF role (not just dev with staff permissions)
        const isStaff = await userHasSpecificRole(member, PermissionLevel.STAFF);

        if (!previousSquad) {
          // New member - add them
          await attendanceManager.addUserToSquad(eventId, dbUser.id, channelId);
          addedCount++;

          // Mark as staff if they have staff permissions
          if (isStaff) {
            await attendanceManager.addStaff(eventId, dbUser.id);
            staffCount++;
          }
        } else if (previousSquad !== channelId) {
          // Member split to a different squad
          await attendanceManager.markUserAsSplit(
            eventId,
            dbUser.id,
            channelId,
            previousSquad,
          );
          splitCount++;

          // Ensure staff status is maintained if applicable
          if (isStaff) {
            const existingStaff = await prisma.attendanceStaff.findFirst({
              where: { eventId, userId: dbUser.id },
            });
            if (!existingStaff) {
              await attendanceManager.addStaff(eventId, dbUser.id);
              staffCount++;
            }
          }
        } else {
          // Member is still in the same squad - ensure not marked as left
          const member = await prisma.squadMember.findFirst({
            where: { squad: { eventId, name: channelId }, userId: dbUser.id },
          });
          if (member?.hasLeft) {
            await prisma.squadMember.update({
              where: { id: member.id },
              data: { hasLeft: false },
            });
          }

          // Ensure staff status is current
          if (isStaff) {
            const existingStaff = await prisma.attendanceStaff.findFirst({
              where: { eventId, userId: dbUser.id },
            });
            if (!existingStaff) {
              await attendanceManager.addStaff(eventId, dbUser.id);
              staffCount++;
            }
          }
        }
      }
    }

    // Mark users who left as "hasLeft"
    let leftCount = 0;
    for (const [discordId, squadName] of currentMemberSquads) {
      if (!processedUsers.has(discordId)) {
        const dbUser = await attendanceManager.findOrCreateUserByDiscordId(
          discordId,
        );
        await attendanceManager.markUserAsLeft(eventId, dbUser.id);
        leftCount++;
      }
    }

    const formatDate = event.date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const summary = [
      `**Attendance autofill complete for ${formatDate} (Event ID: ${eventId})**`,
      "",
      `✅ Added: ${addedCount} members`,
      `🔄 Split: ${splitCount} members`,
      `👤 Staff: ${staffCount} members marked as staff`,
      `❌ Left: ${leftCount} members`,
      `📊 Total in event: ${processedUsers.size} members`,
    ].join("\n");

    await interaction.editReply({
      content: summary,
    });
  }
}
