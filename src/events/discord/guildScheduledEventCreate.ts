import { ArgsOf, Discord, On } from "discordx";
import { calendarSyncManager } from "../../managers/calendarSync/calendarSyncManager.js";
import { loggers } from "../../utility/logger.js";

@Discord()
export class GuildScheduledEventCreateEvent {
  @On({ event: "guildScheduledEventCreate" })
  async onGuildScheduledEventCreate([event]: ArgsOf<"guildScheduledEventCreate">) {
    try {
      loggers.bot.debug(
        `Discord scheduled event created: ${event.name} (${event.id}) in guild ${event.guildId}`,
      );

      // Sync to VRChat calendar
      const result = await calendarSyncManager.syncDiscordEventToVRChat(
        event,
        event.guildId,
      );

      if (result.success) {
        loggers.bot.info(
          `Successfully synced Discord event ${event.id} to VRChat calendar event ${result.vrchatEventId}`,
        );
      } else {
        loggers.bot.warn(
          `Failed to sync Discord event ${event.id} to VRChat: ${result.error}`,
        );
      }
    } catch (error) {
      // Don't crash the bot if sync fails
      loggers.bot.error(
        `Error handling Discord scheduled event create for ${event.id}`,
        error,
      );
    }
  }
}

