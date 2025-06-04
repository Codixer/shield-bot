import { Discord, Slash, SlashOption, Guard, SlashGroup, SlashChoice } from "discordx";
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
    @SlashChoice("Adam", "814239808675119144")
    @SlashChoice("Baker", "814239954641223760")
    @SlashChoice("Coffee", "814240045405569038")
    @SlashChoice("Delta", "814240176317923391")
    @SlashChoice("Eagle", "814240290494742732")
    @SlashChoice("Fitness", "814240677004836925")
    @SlashChoice("Gamma", "814241070110998558")
    @SlashChoice("Mag", "1012880059415150642")
    @SlashChoice("EMT", "814932938961190953")
    @SlashChoice("TRU", "814933108658274365")
    @SlashOption({ name: "squad", description: "Squad (Adam, Baker, Coffee, etc)", type: ApplicationCommandOptionType.String, required: true }) squad: string,
    interaction: CommandInteraction
  ) {
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    // Ensure the user exists in the DB and get their userId
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(user.id);
    const { eventId } = active;
    await attendanceManager.addUserToSquad(eventId, dbUser.id, squad);
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
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const { eventId } = active;
    await attendanceManager.removeUserFromEvent(eventId, user.id);
    await interaction.reply({ content: `Removed <@${user.id}> from event`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "move",
    description: "Move user to squad."
  })
  async move(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    @SlashChoice("Adam", "814239808675119144")
    @SlashChoice("Baker", "814239954641223760")
    @SlashChoice("Coffee", "814240045405569038")
    @SlashChoice("Delta", "814240176317923391")
    @SlashChoice("Eagle", "814240290494742732")
    @SlashChoice("Fitness", "814240677004836925")
    @SlashChoice("Gamma", "814241070110998558")
    @SlashChoice("Mag", "1012880059415150642")
    @SlashChoice("EMT", "814932938961190953")
    @SlashChoice("TRU", "814933108658274365")
    @SlashOption({ name: "squad", description: "Squad (Adam, Baker, Coffee, etc)", type: ApplicationCommandOptionType.String, required: true }) squad: string,
    interaction: CommandInteraction
  ) {
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(user.id);
    const { eventId } = active;
    await attendanceManager.moveUserToSquad(eventId, dbUser.id, squad);
    await interaction.reply({ content: `Moved <@${user.id}> to ${squad}`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "split",
    description: "Split user to squad."
  })
  async split(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    @SlashChoice("Adam", "814239808675119144")
    @SlashChoice("Baker", "814239954641223760")
    @SlashChoice("Coffee", "814240045405569038")
    @SlashChoice("Delta", "814240176317923391")
    @SlashChoice("Eagle", "814240290494742732")
    @SlashChoice("Fitness", "814240677004836925")
    @SlashChoice("Gamma", "814241070110998558")
    @SlashChoice("Mag", "1012880059415150642")
    @SlashChoice("EMT", "814932938961190953")
    @SlashChoice("TRU", "814933108658274365")
    @SlashOption({ name: "squad", description: "Squad (Adam, Baker, Coffee, etc)", type: ApplicationCommandOptionType.String, required: true }) squad: string,
    interaction: CommandInteraction
  ) {
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(user.id);
    const { eventId } = active;
    await attendanceManager.markUserAsSplit(eventId, dbUser.id, squad, "Split from previous squad");
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
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const { eventId } = active;
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
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const { eventId } = active;
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
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const { eventId } = active;
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
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const { eventId } = active;
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
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const { eventId } = active;
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
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const { eventId } = active;
    const summary = await attendanceManager.getEventSummary(eventId);
    // Format the summary for output
    const today = new Date();
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

  @Slash({
    name: "createevent",
    description: "Create a new attendance event and set it as your active event."
  })
  async createEvent(
    interaction: CommandInteraction
  ) {
    const today = new Date();
    // Find or create the user by Discord ID
    const discordId = interaction.user.id;
    // Find the user in the DB
    let user = await attendanceManager.findOrCreateUserByDiscordId(discordId);
    // Create the event and set as active for this user
    const event = await attendanceManager.createEvent(today, user.id);
    await attendanceManager.setActiveEventForUser(user.id, event.id);
    await interaction.reply({ content: `Created and set active event for today (${today.toLocaleDateString()})!`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "endevent",
    description: "End your active attendance event."
  })
  async endEvent(
    interaction: CommandInteraction
  ) {
    const discordId = interaction.user.id;
    const user = await attendanceManager.findOrCreateUserByDiscordId(discordId);
    const eventId = await attendanceManager.getActiveEventIdForUser(user.id);
    if (!eventId) {
      await interaction.reply({ content: "You do not have an active event to end.", flags: MessageFlags.Ephemeral });
      return;
    }
    await attendanceManager.clearActiveEventForUser(user.id);
    await interaction.reply({ content: "Your active attendance event has been ended.", flags: MessageFlags.Ephemeral });
  }
}
