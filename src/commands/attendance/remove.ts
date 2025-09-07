import { Discord, Slash, SlashOption, Guard, SlashGroup } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, MessageFlags, InteractionContextType, ApplicationIntegrationType } from "discord.js";
import { AttendanceManager } from "../../managers/attendance/attendanceManager.js";
import { VRChatLoginGuard, AttendanceHostGuard } from "../../utility/guards.js";

const attendanceManager = new AttendanceManager();

@Discord()
@SlashGroup({
  name: "attendance",
  description: "VRChat attendance tracking commands.",
  contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  integrationTypes: [ApplicationIntegrationType.UserInstall, ApplicationIntegrationType.GuildInstall]
})
@SlashGroup("attendance")
@Guard(VRChatLoginGuard)
@Guard(AttendanceHostGuard)
export class VRChatAttendanceRemoveCommand {

  @Slash({
    name: "remove",
    description: "Completely remove user from event (no attendance record kept)."
  })
  async remove(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    interaction: CommandInteraction
  ) {
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) {
      await interaction.reply({
        content: "No active attendance event found.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const { eventId } = active;
    await attendanceManager.forceRemoveUserFromEvent(eventId, user.id);

    await interaction.reply({
      content: `Completely removed <@${user.id}> from the event (no record kept)`,
      flags: MessageFlags.Ephemeral
    });
  }
}
