import { ArgsOf, Discord, On } from "discordx";
import { calendarSyncManager } from "../../managers/calendarSync/calendarSyncManager.js";
import { loggers } from "../../utility/logger.js";

@Discord()
export class GuildScheduledEventDeleteEvent {
  @On({ event: "guildScheduledEventDelete" })
  async onGuildScheduledEventDelete([event]: ArgsOf<"guildScheduledEventDelete">) {
    try {
      loggers.bot.debug(
        `Discord scheduled event deleted: ${event.name} (${event.id}) in guild ${event.guildId}`,
      );

      // Delete corresponding VRChat calendar event
      const result = await calendarSyncManager.deleteVRChatEvent(
        event.id,
        event.guildId,
      );

      if (result.success) {
        loggers.bot.info(
          `Successfully deleted VRChat calendar event for Discord event ${event.id}`,
        );
      } else {
        loggers.bot.warn(
          `Failed to delete VRChat calendar event for Discord event ${event.id}: ${result.error}`,
        );
      }
    } catch (error) {
      // Don't crash the bot if deletion fails
      loggers.bot.error(
        `Error handling Discord scheduled event delete for ${event.id}`,
        error,
      );
    }
  }
}

