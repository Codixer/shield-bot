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
  integrationTypes: [ApplicationIntegrationType.UserInstall, ApplicationIntegrationType.GuildInstall]
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
    @SlashOption({ name: "user", description: "Discord User ID (string)", type: ApplicationCommandOptionType.String, required: true }) userId: string,
    @SlashChoice({ name: "Adam", value: "814239808675119144" })
    @SlashChoice({ name: "Baker", value: "814239954641223760" })
    @SlashChoice({ name: "Coffee", value: "814240045405569038" })
    @SlashChoice({ name: "Delta", value: "814240176317923391" })
    @SlashChoice({ name: "Eagle", value: "814240290494742732" })
    @SlashChoice({ name: "Fitness", value: "814240677004836925" })
    @SlashChoice({ name: "Gamma", value: "814241070110998558" })
    @SlashChoice({ name: "Mag", value: "1012880059415150642" })
    @SlashChoice({ name: "EMT", value: "814932938961190953" })
    @SlashChoice({ name: "TRU", value: "814933108658274365" })
    @SlashChoice({ name: "AOC", value: "850458906697924608" })
    @SlashOption({ name: "squad", description: "Squad (Adam, Baker, Coffee, etc)", type: ApplicationCommandOptionType.String, required: true }) squad: string,
    interaction: CommandInteraction
  ) {
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(userId);
    const { eventId } = active;
    await attendanceManager.addUserToSquad(eventId, dbUser.id, squad);
    await interaction.reply({ content: `Added <@${userId}> to ${squad}`, flags: MessageFlags.Ephemeral });
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
    @SlashOption({ name: "user", description: "Discord User ID (string)", type: ApplicationCommandOptionType.String, required: true }) userId: string,
    @SlashChoice({ name: "Adam", value: "814239808675119144" })
    @SlashChoice({ name: "Baker", value: "814239954641223760" })
    @SlashChoice({ name: "Coffee", value: "814240045405569038" })
    @SlashChoice({ name: "Delta", value: "814240176317923391" })
    @SlashChoice({ name: "Eagle", value: "814240290494742732" })
    @SlashChoice({ name: "Fitness", value: "814240677004836925" })
    @SlashChoice({ name: "Gamma", value: "814241070110998558" })
    @SlashChoice({ name: "Mag", value: "1012880059415150642" })
    @SlashChoice({ name: "EMT", value: "814932938961190953" })
    @SlashChoice({ name: "TRU", value: "814933108658274365" })
    @SlashOption({ name: "squad", description: "Squad (Adam, Baker, Coffee, etc)", type: ApplicationCommandOptionType.String, required: true }) squad: string,
    interaction: CommandInteraction
  ) {
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(userId);
    const { eventId } = active;
    await attendanceManager.moveUserToSquad(eventId, dbUser.id, squad);
    await interaction.reply({ content: `Moved <@${userId}> to ${squad}`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "split",
    description: "Split user to squad."
  })
  async split(
    @SlashOption({ name: "user", description: "Discord User ID (string)", type: ApplicationCommandOptionType.String, required: true }) userId: string,
    @SlashChoice({ name: "Adam", value: "814239808675119144" })
    @SlashChoice({ name: "Baker", value: "814239954641223760" })
    @SlashChoice({ name: "Coffee", value: "814240045405569038" })
    @SlashChoice({ name: "Delta", value: "814240176317923391" })
    @SlashChoice({ name: "Eagle", value: "814240290494742732" })
    @SlashChoice({ name: "Fitness", value: "814240677004836925" })
    @SlashChoice({ name: "Gamma", value: "814241070110998558" })
    @SlashChoice({ name: "Mag", value: "1012880059415150642" })
    @SlashChoice({ name: "EMT", value: "814932938961190953" })
    @SlashChoice({ name: "TRU", value: "814933108658274365" })
    @SlashOption({ name: "squad", description: "Squad (Adam, Baker, Coffee, etc)", type: ApplicationCommandOptionType.String, required: true }) squad: string,
    interaction: CommandInteraction
  ) {
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(userId);
    const { eventId } = active;
    // Map channel IDs to names and numbers
    const squadMap: Record<string, { name: string, number?: string }> = {
      "814239808675119144": { name: "Adam", number: "02" },
      "814239954641223760": { name: "Baker", number: "16" },
      "814240045405569038": { name: "Coffee", number: "24" },
      "814240176317923391": { name: "Delta", number: "08" },
      "814240290494742732": { name: "Eagle", number: "10" },
      "814240677004836925": { name: "Fitness", number: "34" },
      "814241070110998558": { name: "Gamma", number: "05" },
      "1012880059415150642": { name: "MAG", number: "30" },
      "814932938961190953": { name: "EMT" },
      "814933108658274365": { name: "TRU" }
    };
    // Find the user's current squad for this event
    const summary = await attendanceManager.getEventSummary(eventId);
    let previousSquadId: string | undefined = undefined;
    if (summary && summary.squads) {
      for (const squadObj of summary.squads) {
        if (squadObj.members.some((m: any) => m.userId === dbUser.id)) {
          previousSquadId = squadObj.name; // squadObj.name is the ID
          break;
        }
      }
    }
    // Convert previousSquadId to readable name
    const previousSquadName = previousSquadId ? (squadMap[previousSquadId]?.name || previousSquadId) : undefined;
    await attendanceManager.markUserAsSplit(eventId, dbUser.id, squad, previousSquadName || "Unknown");
    await interaction.reply({ content: `Split <@${userId}> to ${squad}${previousSquadName ? ` (Split from ${previousSquadName})` : ''}`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "lead",
    description: "Mark user as lead."
  })
  async lead(
    @SlashOption({ name: "userid", description: "Discord User ID", type: ApplicationCommandOptionType.String, required: true }) userId: string,
    interaction: CommandInteraction
  ) {
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(userId);
    const { eventId } = active;
    await attendanceManager.markUserAsLead(eventId, dbUser.id);
    await interaction.reply({ content: `Marked <@${userId}> as lead`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "late",
    description: "Mark user as late."
  })
  async late(
    @SlashOption({ name: "userid", description: "Discord User ID", type: ApplicationCommandOptionType.String, required: true }) userId: string,
    @SlashOption({ name: "note", description: "Late note", type: ApplicationCommandOptionType.String, required: false }) note: string,
    interaction: CommandInteraction
  ) {
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(userId);
    const { eventId } = active;
    await attendanceManager.markUserAsLate(eventId, dbUser.id, note);
    await interaction.reply({ content: `Marked <@${userId}> as late${note ? ` (${note})` : ''}`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "staff",
    description: "Add user as staff."
  })
  async staff(
    @SlashOption({ name: "userid", description: "Discord User ID", type: ApplicationCommandOptionType.String, required: true }) userId: string,
    interaction: CommandInteraction
  ) {
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(userId);
    const { eventId } = active;
    await attendanceManager.addStaff(eventId, dbUser.id);
    await interaction.reply({ content: `Added <@${userId}> as staff`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "cohost",
    description: "Set user as cohost."
  })
  async cohost(
    @SlashOption({ name: "userid", description: "Discord User ID", type: ApplicationCommandOptionType.String, required: true }) userId: string,
    interaction: CommandInteraction
  ) {
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(userId);
    const { eventId } = active;
    await attendanceManager.setCohost(eventId, dbUser.id);
    await interaction.reply({ content: `Set <@${userId}> as cohost`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "leave",
    description: "Mark user as left."
  })
  async leave(
    @SlashOption({ name: "userid", description: "Discord User ID", type: ApplicationCommandOptionType.String, required: true }) userId: string,
    interaction: CommandInteraction
  ) {
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(userId);
    const { eventId } = active;
    await attendanceManager.removeUserFromEvent(eventId, dbUser.id);
    await interaction.reply({ content: `Marked <@${userId}> as left`, flags: MessageFlags.Ephemeral });
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
    // Map channel IDs to names and numbers
    const squadMap: Record<string, { name: string, number?: string }> = {
      "814239808675119144": { name: "Adam", number: "02" },
      "814239954641223760": { name: "Baker", number: "16" },
      "814240045405569038": { name: "Coffee", number: "24" },
      "814240176317923391": { name: "Delta", number: "08" },
      "814240290494742732": { name: "Eagle", number: "10" },
      "814240677004836925": { name: "Fitness", number: "34" },
      "814241070110998558": { name: "Gamma", number: "05" },
      "1012880059415150642": { name: "MAG", number: "30" },
      "814932938961190953": { name: "EMT" },
      "814933108658274365": { name: "TRU" }
    };
    const today = new Date();
    let text = `Attendance for ${today.toLocaleString('en-US', { month: 'long', day: 'numeric' })}\n\n`;
    text += `Host: ${summary?.host ? `<@${summary.host.discordId}>` : 'None'}\n`;
    text += `Co-Host: ${summary?.cohost ? `<@${summary.cohost.discordId}>` : 'None'}\n`;
    text += `Attending Staff: ${summary?.staff?.map((s: { user: { discordId: any; }; }) => `<@${s.user.discordId}>`).join(' ') || 'None'} \n\n`;
    for (const squad of summary?.squads || []) {
      const squadInfo = squadMap[squad.name] || { name: squad.name };
      let squadLine = squadInfo.name;
      if (squadInfo.number) squadLine += ` - ${squadInfo.number}`;
      text += `${squadLine}\n`;
      for (const member of squad.members) {
        let line = `<@${member.user.discordId}>`;
        if (member.isLead) line += ' (Lead)';
        if (member.isSplit && member.splitFrom) line += ` (Split from ${member.splitFrom})`;
        if (member.isLate && member.lateNote) line += ` (Joined ${member.lateNote})`;
        text += line + '\n';
      }
      text += '\n';
    }
    // Wrap in code block for Discord
    text = '```' + text + '```';
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
    // Delete all data related to this event
    await attendanceManager.deleteEventData(eventId);
    await interaction.reply({ content: "Your active attendance event has been ended and all event data has been cleared.", flags: MessageFlags.Ephemeral });
  }
}
