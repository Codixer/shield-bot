import { Discord, Slash, SlashOption, Guard, SlashGroup } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, MessageFlags, AutocompleteInteraction, BaseInteraction, InteractionContextType, ApplicationIntegrationType } from "discord.js";
import { AttendanceManager } from "../../managers/attendance/attendanceManager.js";
import { VRChatLoginGuard } from "../../utility/guards.js";

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
export class VRChatAttendanceSelectCommand {

  @Slash({
    name: "select",
    description: "Select an event to work with."
  })
  async select(
    @SlashOption({ 
      name: "event", 
      description: "Event to select", 
      type: ApplicationCommandOptionType.Integer, 
      required: true,
      autocomplete: true 
    }) eventId: number,
    interaction: BaseInteraction
  ) {
    if (interaction.isAutocomplete()) {
      const autoInteraction = interaction as AutocompleteInteraction;
      const focused = autoInteraction.options.getFocused(true);
      
      if (focused.name === 'event') {
        const user = await attendanceManager.findOrCreateUserByDiscordId(autoInteraction.user.id);
        const events = await attendanceManager.getUserEvents(user.id);
        
        const choices = events
          .filter(event => {
            const eventStr = `${event.id}`;
            const dateStr = event.date.toLocaleDateString();
            return eventStr.includes(focused.value.toString()) || 
                   dateStr.includes(focused.value.toString());
          })
          .slice(0, 25)
          .map(event => ({
            name: `${event.date.toLocaleDateString()} (ID: ${event.id})${event.host?.discordId === autoInteraction.user.id ? ' - Your Event' : ''}`,
            value: event.id
          }));
        
        await autoInteraction.respond(choices);
      }
      return;
    }

    const cmdInteraction = interaction as CommandInteraction;
    const user = await attendanceManager.findOrCreateUserByDiscordId(cmdInteraction.user.id);
    
    // Check if the event exists and user has access to it
    const event = await attendanceManager.getEventById(eventId);
    if (!event) {
      await cmdInteraction.reply({
        content: "Event not found.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Set as active event
    await attendanceManager.setActiveEventForUser(user.id, eventId);
    
    const formatDate = event.date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    await cmdInteraction.reply({
      content: `Selected event for ${formatDate} (ID: ${eventId}) as your active event.`,
      flags: MessageFlags.Ephemeral
    });
  }
}
