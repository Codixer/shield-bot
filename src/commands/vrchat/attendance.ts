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
  @SlashGroup("attendance")
  async add(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    @SlashOption({ name: "squad", description: "Squad name", type: ApplicationCommandOptionType.String, required: true }) squad: string,
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    await attendanceManager.addUserToSquad(eventId, user.id, squad);
    await interaction.reply(`Added <@${user.id}> to ${squad}`);
  }

  @Slash({
    name: "remove",
    description: "Remove user from event."
  })
  @SlashGroup("attendance")
  async remove(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    await attendanceManager.removeUserFromEvent(eventId, user.id);
    await interaction.reply(`Removed <@${user.id}> from event`);
  }

  @Slash({
    name: "move",
    description: "Move user to squad."
  })
  @SlashGroup("attendance")
  async move(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    @SlashOption({ name: "squad", description: "Squad name", type: ApplicationCommandOptionType.String, required: true }) squad: string,
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    await attendanceManager.moveUserToSquad(eventId, user.id, squad);
    await interaction.reply(`Moved <@${user.id}> to ${squad}`);
  }

  @Slash({
    name: "split",
    description: "Split user to squad."
  })
  @SlashGroup("attendance")
  async split(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    @SlashOption({ name: "squad", description: "Squad name", type: ApplicationCommandOptionType.String, required: true }) squad: string,
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    await attendanceManager.markUserAsSplit(eventId, user.id, squad, "Split from previous squad");
    await interaction.reply(`Split <@${user.id}> to ${squad}`);
  }

  @Slash({
    name: "lead",
    description: "Mark user as lead."
  })
  @SlashGroup("attendance")
  async lead(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    await attendanceManager.markUserAsLead(eventId, user.id);
    await interaction.reply(`Marked <@${user.id}> as lead`);
  }

  @Slash({
    name: "late",
    description: "Mark user as late."
  })
  @SlashGroup("attendance")
  async late(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    @SlashOption({ name: "note", description: "Late note", type: ApplicationCommandOptionType.String, required: false }) note: string,
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    await attendanceManager.markUserAsLate(eventId, user.id, note);
    await interaction.reply(`Marked <@${user.id}> as late${note ? ` (${note})` : ''}`);
  }

  @Slash({
    name: "staff",
    description: "Add user as staff."
  })
  @SlashGroup("attendance")
  async staff(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    await attendanceManager.addStaff(eventId, user.id);
    await interaction.reply(`Added <@${user.id}> as staff`);
  }

  @Slash({
    name: "cohost",
    description: "Set user as cohost."
  })
  @SlashGroup("attendance")
  async cohost(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    await attendanceManager.setCohost(eventId, user.id);
    await interaction.reply(`Set <@${user.id}> as cohost`);
  }

  @Slash({
    name: "leave",
    description: "Mark user as left."
  })
  @SlashGroup("attendance")
  async leave(
    @SlashOption({ name: "user", description: "User", type: ApplicationCommandOptionType.User, required: true }) user: any,
    interaction: CommandInteraction
  ) {
    const today = new Date();
    const event = await attendanceManager.createEvent(today);
    const eventId = event.id;
    await attendanceManager.removeUserFromEvent(eventId, user.id);
    await interaction.reply(`Marked <@${user.id}> as left`);
  }
}
