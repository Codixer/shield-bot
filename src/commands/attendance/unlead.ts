import { Discord, Slash, SlashOption, Guard, SlashGroup } from "discordx";
import {
  CommandInteraction,
  ApplicationCommandOptionType,
  MessageFlags,
  InteractionContextType,
  ApplicationIntegrationType,
  User,
} from "discord.js";
import { AttendanceManager } from "../../managers/attendance/attendanceManager.js";
import { AttendanceHostGuard } from "../../utility/guards.js";
import { prisma } from "../../main.js";

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
export class VRChatAttendanceUnleadCommand {
  @Slash({
    name: "unlead",
    description: "Remove lead status from a user.",
  })
  async unlead(
    @SlashOption({
      name: "user",
      description: "Discord User",
      type: ApplicationCommandOptionType.User,
      required: true,
    })
    user: User,
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

    const member = await prisma.squadMember.findFirst({
      where: { squad: { eventId }, userId: dbUser.id, isLead: true },
    });

    if (!member) {
      await interaction.reply({
        content: `<@${user.id}> is not marked as a lead.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await prisma.squadMember.update({
      where: { id: member.id },
      data: { isLead: false },
    });

    await interaction.reply({
      content: `Removed lead status from <@${user.id}>`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
