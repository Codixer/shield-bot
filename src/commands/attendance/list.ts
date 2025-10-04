import { Discord, Slash, Guard, SlashGroup } from "discordx";
import {
  CommandInteraction,
  MessageFlags,
  EmbedBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
} from "discord.js";
import { Pagination } from "@discordx/pagination";
import { AttendanceManager } from "../../managers/attendance/attendanceManager.js";

const attendanceManager = new AttendanceManager();

@Discord()
@SlashGroup({
  name: "attendance",
  description: "VRChat attendance tracking commands.",
  contexts: [
    InteractionContextType.Guild,
  ],
  integrationTypes: [
    ApplicationIntegrationType.GuildInstall,
  ],
})
@SlashGroup("attendance")
export class VRChatAttendanceListCommand {
  @Slash({
    name: "list",
    description: "List all attendance events.",
  })
  async list(interaction: CommandInteraction) {
    const user = await attendanceManager.findOrCreateUserByDiscordId(
      interaction.user.id,
    );
    const events = await attendanceManager.getAllEvents();

    if (events.length === 0) {
      await interaction.reply({
        content: "There are no attendance events.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const activeEventId = await attendanceManager.getActiveEventIdForUser(
      user.id,
    );

    // Create pages with 5 events per page
    const eventsPerPage = 5;
    const pages = [];
    
    for (let i = 0; i < events.length; i += eventsPerPage) {
      const pageEvents = events.slice(i, i + eventsPerPage);
      let description = "";
      
      for (const event of pageEvents) {
        const formatDate = event.date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        // Calculate total attendees
        const squadMemberIds = new Set(
          event.squads.flatMap((squad) => 
            squad.members.map((member) => member.userId)
          )
        );
        const staffIds = new Set(event.staff.map((s) => s.userId));
        const allAttendeeIds = new Set([...squadMemberIds, ...staffIds]);
        const attendeeCount = allAttendeeIds.size;

        const isActive = event.id === activeEventId ? " **(ACTIVE)**" : "";
        const isHost = event.hostId === user.id ? " 👑" : "";
        const isCohost = event.cohostId === user.id ? " 🤝" : "";
        
        // Get host username
        let hostName = "Unknown";
        if (event.host?.discordId) {
          try {
            const hostUser = await interaction.guild?.members.fetch(event.host.discordId);
            hostName = hostUser?.user.username || hostUser?.user.tag || event.host.discordId;
          } catch {
            // If we can't fetch the user, fall back to Discord ID
            hostName = event.host.discordId;
          }
        }

        description += `**${formatDate}** (ID: ${event.id})${isActive}${isHost}${isCohost}\n`;
        description += `  Host: ${hostName} | Attendees: ${attendeeCount}\n\n`;
      }

      const embed = new EmbedBuilder()
        .setTitle("Attendance Events")
        .setDescription(description)
        .setColor(0x00ae86)
        .setFooter({
          text: `Page ${pages.length + 1} of ${Math.ceil(events.length / eventsPerPage)} | Use /attendance select <event_id> to switch active event`,
        });

      pages.push({ embeds: [embed] });
    }

    // Create pagination
    const pagination = new Pagination(interaction, pages, {
      ephemeral: true,
      time: 5 * 60 * 1000, // 5 minutes
    });

    await pagination.send();
  }
}
