import { Discord, Slash, SlashOption, Guard, SlashGroup } from "discordx";
import {
  CommandInteraction,
  ApplicationCommandOptionType,
  MessageFlags,
  InteractionContextType,
  ApplicationIntegrationType,
} from "discord.js";
import { AttendanceManager } from "../../managers/attendance/attendanceManager.js";
import { AttendanceHostGuard } from "../../utility/guards.js";

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
@Guard(AttendanceHostGuard)
export class VRChatAttendanceCohostCommand {
  @Slash({
    name: "cohost",
    description: "Set user as cohost.",
  })
  async cohost(
    @SlashOption({
      name: "user",
      description: "Discord User",
      type: ApplicationCommandOptionType.User,
      required: true,
    })
    user: any,
    interaction: CommandInteraction,
  ) {
    const active =
      await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) {
      await interaction.reply({
        content: "No active attendance event found.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { eventId } = active;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(user.id);
    await attendanceManager.setCohost(eventId, dbUser.id);

    await interaction.reply({
      content: `Set <@${user.id}> as cohost`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
