import { Discord, Slash, SlashOption, Guard, SlashGroup } from "discordx";
import {
  CommandInteraction,
  ApplicationCommandOptionType,
  MessageFlags,
  AutocompleteInteraction,
  BaseInteraction,
  InteractionContextType,
  ApplicationIntegrationType,
} from "discord.js";
import { AttendanceManager } from "../../managers/attendance/attendanceManager.js";

const attendanceManager = new AttendanceManager();

@Discord()
@SlashGroup({
  name: "attendance",
  description: "VRChat attendance tracking commands.",
  contexts: [
    InteractionContextType.Guild,
  ],
  integrationTypes: [
    ApplicationIntegrationType.GuildInstall,
  ],
})
@SlashGroup("attendance")
export class VRChatAttendanceSelectCommand {
  @Slash({
    name: "select",
    description: "Select an event to work with.",
  })
  async select(
    @SlashOption({
      name: "event",
      description: "Event to select",
      type: ApplicationCommandOptionType.Integer,
      required: true,
      autocomplete: true,
    })
    eventId: number,
    interaction: BaseInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      const autoInteraction = interaction as AutocompleteInteraction;
      const focused = autoInteraction.options.getFocused(true);

      if (focused.name === "event") {
        const user = await attendanceManager.findOrCreateUserByDiscordId(
          autoInteraction.user.id,
        );
        const events = await attendanceManager.getAllEvents();

        const choices = await Promise.all(
          events
            .filter((event) => {
              const eventStr = `${event.id}`;
              const dateStr = event.date.toLocaleDateString();
              return (
                eventStr.includes(focused.value.toString()) ||
                dateStr.includes(focused.value.toString())
              );
            })
            .slice(0, 25)
            .map(async (event) => {
              // Calculate total attendees: unique users from squads + staff
              const squadMemberIds = new Set(
                event.squads.flatMap((squad) => 
                  squad.members.map((member) => member.userId)
                )
              );
              const staffIds = new Set(event.staff.map((s) => s.userId));
              const allAttendeeIds = new Set([...squadMemberIds, ...staffIds]);
              const attendeeCount = allAttendeeIds.size;

              // Get host username
              let hostName = "Unknown";
              if (event.host?.discordId) {
                try {
                  const hostUser = await autoInteraction.guild?.members.fetch(event.host.discordId);
                  hostName = hostUser?.user.username || hostUser?.user.tag || event.host.discordId;
                } catch {
                  hostName = event.host.discordId;
                }
              }

              return {
                name: `${event.date.toLocaleDateString()} (ID: ${event.id}) - ${attendeeCount} attendee${attendeeCount !== 1 ? 's' : ''} - Host: ${hostName}`,
                value: event.id,
              };
            })
        );

        await autoInteraction.respond(choices);
      }
      return;
    }

    const cmdInteraction = interaction as CommandInteraction;
    const user = await attendanceManager.findOrCreateUserByDiscordId(
      cmdInteraction.user.id,
    );

    // Check if the event exists and user has access to it
    const event = await attendanceManager.getEventById(eventId);
    if (!event) {
      await cmdInteraction.reply({
        content: "Event not found.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Set as active event
    await attendanceManager.setActiveEventForUser(user.id, eventId);

    const formatDate = event.date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    await cmdInteraction.reply({
      content: `Selected event for ${formatDate} (ID: ${eventId}) as your active event.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
