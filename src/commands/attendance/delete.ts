import { Discord, Slash, SlashOption, SlashGroup } from "discordx";
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
export class VRChatAttendanceDeleteCommand {
  @Slash({
    name: "delete",
    description: "Delete an attendance event.",
  })
  async delete(
    @SlashOption({
      name: "event",
      description: "Event to delete",
      type: ApplicationCommandOptionType.Integer,
      required: true,
      autocomplete: true,
    })
    eventId: number,
    @SlashOption({
      name: "confirm",
      description: "Type 'yes' to confirm deletion",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    confirm: string,
    interaction: BaseInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      const autoInteraction = interaction as AutocompleteInteraction;
      const focused = autoInteraction.options.getFocused(true);

      if (focused.name === "event") {
        // User lookup needed for event filtering
        void await attendanceManager.findOrCreateUserByDiscordId(
          autoInteraction.user.id,
        );
        const events = await attendanceManager.getAllEvents();

        const choices = await Promise.all(
          events
            .filter((event: { id: number; date: Date }) => {
              const eventStr = `${event.id}`;
              const dateStr = event.date.toLocaleDateString();
              return (
                eventStr.includes(focused.value.toString()) ||
                dateStr.includes(focused.value.toString())
              );
            })
            .slice(0, 25)
            .map(async (event: { 
              id: number; 
              date: Date; 
              squads: Array<{ members: Array<{ userId: number }> }>; 
              staff: Array<{ userId: number }>; 
              host?: { discordId: string | null } | null 
            }) => {
              // Calculate total attendees: unique users from squads + staff
              const squadMemberIds = new Set(
                event.squads.flatMap((squad: { members: Array<{ userId: number }> }) => 
                  squad.members.map((member: { userId: number }) => member.userId)
                )
              );
              const staffIds = new Set(event.staff.map((s: { userId: number }) => s.userId));
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

    if (confirm.toLowerCase() !== "yes") {
      await cmdInteraction.reply({
        content: "Deletion cancelled. You must type 'yes' to confirm.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const user = await attendanceManager.findOrCreateUserByDiscordId(
      cmdInteraction.user.id,
    );

    // Check if the event exists and user has permission to delete it
    const event = await attendanceManager.getEventById(eventId);
    if (!event) {
      await cmdInteraction.reply({
        content: "Event not found.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Only host can delete the event
    if (event.hostId !== user.id) {
      await cmdInteraction.reply({
        content: "Only the event host can delete this event.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Clear active event if this was the user's active event
    const activeEventId = await attendanceManager.getActiveEventIdForUser(
      user.id,
    );
    if (activeEventId === eventId) {
      await attendanceManager.clearActiveEventForUser(user.id);
    }

    // Delete the event and all related data
    await attendanceManager.deleteEventData(eventId);

    const formatDate = event.date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    await cmdInteraction.reply({
      content: `Successfully deleted attendance event for ${formatDate} (ID: ${eventId}).`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
