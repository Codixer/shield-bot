import { Discord, Slash, SlashOption, Guard, SlashGroup } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, MessageFlags, InteractionContextType, ApplicationIntegrationType } from "discord.js";
import { AttendanceManager } from "../../managers/attendance/attendanceManager.js";

const attendanceManager = new AttendanceManager();

@Discord()
@SlashGroup({
  name: "attendance",
  description: "VRChat attendance tracking commands.",
  contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  integrationTypes: [ApplicationIntegrationType.UserInstall, ApplicationIntegrationType.GuildInstall]
})
@SlashGroup("attendance")
export class VRChatAttendanceCreateCommand {

  @Slash({
    name: "create",
    description: "Create a new attendance event."
  })
  async create(
    @SlashOption({ name: "date", description: "Event date (YYYY-MM-DD) or 'today'", type: ApplicationCommandOptionType.String, required: false }) dateInput: string,
    @SlashOption({ name: "host", description: "Event host (defaults to you)", type: ApplicationCommandOptionType.User, required: false }) host: any,
    @SlashOption({ name: "cohost", description: "Event co-host", type: ApplicationCommandOptionType.User, required: false }) cohost: any,
    interaction: CommandInteraction
  ) {
    let eventDate: Date;
    
    if (!dateInput || dateInput.toLowerCase() === 'today') {
      eventDate = new Date();
    } else {
      try {
        eventDate = new Date(dateInput);
        if (isNaN(eventDate.getTime())) {
          await interaction.reply({
            content: "Invalid date format. Please use YYYY-MM-DD or 'today'.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }
      } catch (error) {
        await interaction.reply({
          content: "Invalid date format. Please use YYYY-MM-DD or 'today'.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
    }

    const hostUser = host || interaction.user;
    const cohostUser = cohost;
    
    const dbHost = await attendanceManager.findOrCreateUserByDiscordId(hostUser.id);
    const dbCohost = cohostUser ? await attendanceManager.findOrCreateUserByDiscordId(cohostUser.id) : undefined;
    
    const event = await attendanceManager.createEvent(
      eventDate, 
      dbHost.id, 
      dbCohost?.id
    );

    // Set this as the active event for the user who created it
    const creator = await attendanceManager.findOrCreateUserByDiscordId(interaction.user.id);
    await attendanceManager.setActiveEventForUser(creator.id, event.id);

    const formatDate = eventDate.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    await interaction.reply({
      content: `Created attendance event for ${formatDate}\n` +
               `Host: <@${hostUser.id}>\n` +
               `${cohostUser ? `Co-Host: <@${cohostUser.id}>\n` : ''}` +
               `Event ID: ${event.id}\n\n` +
               `This event is now your active event. Use other attendance commands to manage it.`,
      flags: MessageFlags.Ephemeral
    });
  }
}
