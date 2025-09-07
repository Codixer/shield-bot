import { Discord, Slash, SlashOption, Guard, SlashGroup, SlashChoice, On } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, MessageFlags, InteractionContextType, ApplicationIntegrationType, AutocompleteInteraction, BaseInteraction } from "discord.js";
import { AttendanceManager } from "../../managers/attendance/attendanceManager.js";
import { VRChatLoginGuard } from "../../utility/guards.js";
import { AttendanceHostGuard } from "../../utility/guards.js";
import { prisma } from "../../main.js";

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
@Guard(AttendanceHostGuard)
export class VRChatAttendanceCommand {
  @Slash({
    name: "add",
    description: "Add user to squad."
  })
  async add(
    @SlashOption({ name: "user", description: "Discord User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    @SlashOption({ name: "squad", description: "Squad", type: ApplicationCommandOptionType.String, required: true, autocomplete: true }) squad: string,
    interaction: BaseInteraction
  ) {
    if (interaction.isAutocomplete()) {
      const autoInteraction = interaction as AutocompleteInteraction;
      const focused = autoInteraction.options.getFocused(true);
      if (focused.name === 'squad') {
        if (!autoInteraction.guildId) return;
        const settings = await prisma.guildSettings.findUnique({ where: { guildId: autoInteraction.guildId } });
        const enrolled = (settings?.enrolledChannels as string[]) || [];
        const guild = autoInteraction.guild;
        if (!guild) return;
        const choices = [];
        for (const channelId of enrolled) {
          const channel = guild.channels.cache.get(channelId);
          if (channel && channel.name.toLowerCase().includes(focused.value.toLowerCase())) {
            choices.push({ name: channel.name, value: channelId });
          }
        }
        await autoInteraction.respond(choices.slice(0, 25));
      }
      return;
    }
    const cmdInteraction = interaction as CommandInteraction;
    const active = await attendanceManager.getActiveEventForInteraction(cmdInteraction);
    if (!active) return;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(user.id);
    const { eventId } = active;
    await attendanceManager.addUserToSquad(eventId, dbUser.id, squad);
    const channel = cmdInteraction.guild?.channels.cache.get(squad);
    const squadName = channel ? channel.name : squad;
    await cmdInteraction.reply({ content: `Added <@${user.id}> to ${squadName}`, flags: MessageFlags.Ephemeral });
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
    @SlashOption({ name: "user", description: "Discord User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    @SlashOption({ name: "squad", description: "Squad", type: ApplicationCommandOptionType.String, required: true, autocomplete: true }) squad: string,
    interaction: BaseInteraction
  ) {
    if (interaction.isAutocomplete()) {
      const autoInteraction = interaction as AutocompleteInteraction;
      const focused = autoInteraction.options.getFocused(true);
      if (focused.name === 'squad') {
        if (!autoInteraction.guildId) return;
        const settings = await prisma.guildSettings.findUnique({ where: { guildId: autoInteraction.guildId } });
        const enrolled = (settings?.enrolledChannels as string[]) || [];
        const guild = autoInteraction.guild;
        if (!guild) return;
        const choices = [];
        for (const channelId of enrolled) {
          const channel = guild.channels.cache.get(channelId);
          if (channel && channel.name.toLowerCase().includes(focused.value.toLowerCase())) {
            choices.push({ name: channel.name, value: channelId });
          }
        }
        await autoInteraction.respond(choices.slice(0, 25));
      }
      return;
    }
    const cmdInteraction = interaction as CommandInteraction;
    const active = await attendanceManager.getActiveEventForInteraction(cmdInteraction);
    if (!active) return;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(user.id);
    const { eventId } = active;
    await attendanceManager.moveUserToSquad(eventId, dbUser.id, squad);
    const channel = cmdInteraction.guild?.channels.cache.get(squad);
    const squadName = channel ? channel.name : squad;
    await cmdInteraction.reply({ content: `Moved <@${user.id}> to ${squadName}`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "split",
    description: "Split user to squad."
  })
  async split(
    @SlashOption({ name: "user", description: "Discord User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    @SlashOption({ name: "squad", description: "Squad", type: ApplicationCommandOptionType.String, required: true, autocomplete: true }) squad: string,
    interaction: BaseInteraction
  ) {
    if (interaction.isAutocomplete()) {
      const autoInteraction = interaction as AutocompleteInteraction;
      const focused = autoInteraction.options.getFocused(true);
      if (focused.name === 'squad') {
        if (!autoInteraction.guildId) return;
        const settings = await prisma.guildSettings.findUnique({ where: { guildId: autoInteraction.guildId } });
        const enrolled = (settings?.enrolledChannels as string[]) || [];
        const guild = autoInteraction.guild;
        if (!guild) return;
        const choices = [];
        for (const channelId of enrolled) {
          const channel = guild.channels.cache.get(channelId);
          if (channel && channel.name.toLowerCase().includes(focused.value.toLowerCase())) {
            choices.push({ name: channel.name, value: channelId });
          }
        }
        await autoInteraction.respond(choices.slice(0, 25));
      }
      return;
    }
    const cmdInteraction = interaction as CommandInteraction;
    const active = await attendanceManager.getActiveEventForInteraction(cmdInteraction);
    if (!active) return;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(user.id);
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
    const previousChannel = previousSquadId ? cmdInteraction.guild?.channels.cache.get(previousSquadId) : null;
    const previousSquadName = previousChannel ? previousChannel.name : (previousSquadId || "Unknown");
    await attendanceManager.markUserAsSplit(eventId, dbUser.id, squad, previousSquadName);
    const channel = cmdInteraction.guild?.channels.cache.get(squad);
    const squadName = channel ? channel.name : squad;
    await cmdInteraction.reply({ content: `Split <@${user.id}> to ${squadName}${previousSquadName ? ` (Split from ${previousSquadName})` : ''}`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "lead",
    description: "Mark user as lead."
  })
  async lead(
    @SlashOption({ name: "user", description: "Discord User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    interaction: CommandInteraction
  ) {
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(user.id);
    const { eventId } = active;
    await attendanceManager.markUserAsLead(eventId, dbUser.id);
    await interaction.reply({ content: `Marked <@${user.id}> as lead`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "late",
    description: "Mark user as late."
  })
  async late(
    @SlashOption({ name: "user", description: "Discord User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    @SlashOption({ name: "note", description: "Late note", type: ApplicationCommandOptionType.String, required: false }) note: string,
    interaction: CommandInteraction
  ) {
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(user.id);
    const { eventId } = active;
    await attendanceManager.markUserAsLate(eventId, dbUser.id, note);
    await interaction.reply({ content: `Marked <@${user.id}> as late${note ? ` (${note})` : ''}`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "staff",
    description: "Add user as staff."
  })
  async staff(
    @SlashOption({ name: "user", description: "Discord User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    interaction: CommandInteraction
  ) {
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(user.id);
    const { eventId } = active;
    await attendanceManager.addStaff(eventId, dbUser.id);
    await interaction.reply({ content: `Added <@${user.id}> as staff`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "cohost",
    description: "Set user as cohost."
  })
  async cohost(
    @SlashOption({ name: "user", description: "Discord User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    interaction: CommandInteraction
  ) {
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(user.id);
    const { eventId } = active;
    await attendanceManager.setCohost(eventId, dbUser.id);
    await interaction.reply({ content: `Set <@${user.id}> as cohost`, flags: MessageFlags.Ephemeral });
  }

  @Slash({
    name: "leave",
    description: "Mark user as left."
  })
  async leave(
    @SlashOption({ name: "user", description: "Discord User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    interaction: CommandInteraction
  ) {
    const active = await attendanceManager.getActiveEventForInteraction(interaction);
    if (!active) return;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(user.id);
    const { eventId } = active;
    await attendanceManager.removeUserFromEvent(eventId, dbUser.id);
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
    const today = new Date();
    let text = `Attendance for ${today.toLocaleString('en-US', { month: 'long', day: 'numeric' })}\n\n`;
    text += `Host: ${summary?.host ? `<@${summary.host.discordId}>` : 'None'}\n`;
    text += `Co-Host: ${summary?.cohost ? `<@${summary.cohost.discordId}>` : 'None'}\n`;
    text += `Attending Staff: ${summary?.staff?.map((s: { user: { discordId: any; }; }) => `<@${s.user.discordId}>`).join(' ') || 'None'} \n\n`;
    for (const squad of summary?.squads || []) {
      const channel = interaction.guild?.channels.cache.get(squad.name);
      const squadName = channel ? channel.name : squad.name;
      text += `${squadName}\n`;
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
