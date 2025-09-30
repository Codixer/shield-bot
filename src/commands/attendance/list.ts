import { Discord, Slash, Guard, SlashGroup } from "discordx";
import {
  CommandInteraction,
  MessageFlags,
  EmbedBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
} from "discord.js";
import { AttendanceManager } from "../../managers/attendance/attendanceManager.js";

const attendanceManager = new AttendanceManager();

@Discord()
@SlashGroup({
  name: "attendance",
  description: "VRChat attendance tracking commands.",
  contexts: [
    InteractionContextType.Guild,
    InteractionContextType.PrivateChannel,
  ],
  integrationTypes: [
    ApplicationIntegrationType.UserInstall,
    ApplicationIntegrationType.GuildInstall,
  ],
})
@SlashGroup("attendance")
export class VRChatAttendanceListCommand {
  @Slash({
    name: "list",
    description: "List all events you have access to.",
  })
  async list(interaction: CommandInteraction) {
    const user = await attendanceManager.findOrCreateUserByDiscordId(
      interaction.user.id,
    );
    const events = await attendanceManager.getUserEvents(user.id);

    if (events.length === 0) {
      await interaction.reply({
        content: "You have no attendance events.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const activeEventId = await attendanceManager.getActiveEventIdForUser(
      user.id,
    );

    let description = "";
    for (const event of events) {
      const formatDate = event.date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const isActive = event.id === activeEventId ? " **(ACTIVE)**" : "";
      const isHost = event.hostId === user.id ? " 👑" : "";
      const isCohost = event.cohostId === user.id ? " 🤝" : "";

      description += `**${formatDate}** (ID: ${event.id})${isActive}${isHost}${isCohost}\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle("Your Attendance Events")
      .setDescription(description)
      .setColor(0x00ae86)
      .setFooter({
        text: "Use /attendance select <event_id> to switch active event",
      });

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
}
