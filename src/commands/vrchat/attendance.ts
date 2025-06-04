import { Discord, Slash, SlashOption, Guard, SlashGroup } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, MessageFlags, InteractionContextType, ApplicationIntegrationType } from "discord.js";
import { AttendanceManager } from "../../managers/attendanceManager.js";
import { VRChatLoginGuard } from "../../utility/guards.js";

const attendanceManager = new AttendanceManager();

@Discord()
@SlashGroup({
  name: "vrchat",
  description: "VRChat related commands.",
  contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  integrationTypes: [ApplicationIntegrationType.UserInstall]
})
@SlashGroup("vrchat")
@SlashGroup({ name: "attendance", description: "Attendance tracking commands.", root: "vrchat" })
@SlashGroup("attendance", "vrchat")
@Guard(VRChatLoginGuard)
export class VRChatAttendanceCommand {
  @Slash({
    name: "add",
    description: "Add user to squad."
  })
  async add(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    @SlashOption({ name: "squad", description: "Squad name", type: ApplicationCommandOptionType.String, required: true }) squad: string,
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    await attendanceManager.addUserToSquad(eventId, user.id, squad);
    await interaction.reply({ content: `Added <@${user.id}> to ${squad}`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "remove",
    description: "Remove user from event."
  })
  async remove(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    await attendanceManager.removeUserFromEvent(eventId, user.id);
    await interaction.reply({ content: `Removed <@${user.id}> from event`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "move",
    description: "Move user to squad."
  })
  async move(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    @SlashOption({ name: "squad", description: "Squad name", type: ApplicationCommandOptionType.String, required: true }) squad: string,
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    await attendanceManager.moveUserToSquad(eventId, user.id, squad);
    await interaction.reply({ content: `Moved <@${user.id}> to ${squad}`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "split",
    description: "Split user to squad."
  })
  async split(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    @SlashOption({ name: "squad", description: "Squad name", type: ApplicationCommandOptionType.String, required: true }) squad: string,
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    await attendanceManager.markUserAsSplit(eventId, user.id, squad, "Split from previous squad");
    await interaction.reply({ content: `Split <@${user.id}> to ${squad}`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "lead",
    description: "Mark user as lead."
  })
  async lead(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    await attendanceManager.markUserAsLead(eventId, user.id);
    await interaction.reply({ content: `Marked <@${user.id}> as lead`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "late",
    description: "Mark user as late."
  })
  async late(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    @SlashOption({ name: "note", description: "Late note", type: ApplicationCommandOptionType.String, required: false }) note: string,
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    await attendanceManager.markUserAsLate(eventId, user.id, note);
    await interaction.reply({ content: `Marked <@${user.id}> as late${note ? ` (${note})` : ''}`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "staff",
    description: "Add user as staff."
  })
  async staff(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    await attendanceManager.addStaff(eventId, user.id);
    await interaction.reply({ content: `Added <@${user.id}> as staff`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "cohost",
    description: "Set user as cohost."
  })
  async cohost(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    await attendanceManager.setCohost(eventId, user.id);
    await interaction.reply({ content: `Set <@${user.id}> as cohost`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "leave",
    description: "Mark user as left."
  })
  async leave(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    await attendanceManager.removeUserFromEvent(eventId, user.id);
    await interaction.reply({ content: `Marked <@${user.id}> as left`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "paste",
    description: "Paste the formatted attendance summary."
  })
  async paste(
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    const summary = await attendanceManager.getEventSummary(eventId);
    // Format the summary for output
    let text = `Attendance for ${today.toLocaleString('en-US', { month: 'long', day: 'numeric' })}\n\n`;
    text += `Host: ${summary?.host ? `<@${summary.host.discordId}>` : 'None'}\n`;
    text += `Co-Host: ${summary?.cohost ? `<@${summary.cohost.discordId}>` : 'None'}\n`;
    text += `Attending Staff: ${summary?.staff?.map(s => `<@${s.user.discordId}>`).join(' ') || 'None'} \n\n`;
    for (const squad of summary?.squads || []) {
      text += `${squad.name.toUpperCase()} - ${squad.members.length.toString().padStart(2, '0')}\n`;
      for (const member of squad.members) {
        let line = `<@${member.user.discordId}>`;
        if (member.isLead) line += ' (Lead)';
        if (member.isSplit && member.splitFrom) line += ` (Split from ${member.splitFrom})`;
        if (member.isLate && member.lateNote) line += ` (Joined ${member.lateNote})`;
        text += line + '\n';
      }
      text += '\n';
    }
    await interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
  }
}
