import { ArgsOf, Discord, On } from "discordx";
import { calendarSyncManager } from "../../managers/calendarSync/calendarSyncManager.js";
import { loggers } from "../../utility/logger.js";

@Discord()
export class GuildScheduledEventUpdateEvent {
  @On({ event: "guildScheduledEventUpdate" })
  async onGuildScheduledEventUpdate([oldEvent, newEvent]: ArgsOf<"guildScheduledEventUpdate">) {
    try {
      loggers.bot.debug(
        `Discord scheduled event updated: ${newEvent.name} (${newEvent.id}) in guild ${newEvent.guildId}`,
      );

      // Only sync if event hasn't started yet
      if (!calendarSyncManager.shouldSyncEvent(newEvent)) {
        loggers.bot.debug(
          `Discord event ${newEvent.id} has already started, skipping update`,
        );
        return;
      }

      // Sync to VRChat calendar
      const result = await calendarSyncManager.syncDiscordEventToVRChat(
        newEvent,
        newEvent.guildId,
      );

      if (result.success) {
        loggers.bot.info(
          `Successfully synced Discord event update ${newEvent.id} to VRChat calendar event ${result.vrchatEventId}`,
        );
      } else {
        loggers.bot.warn(
          `Failed to sync Discord event update ${newEvent.id} to VRChat: ${result.error}`,
        );
      }
    } catch (error) {
      // Don't crash the bot if sync fails
      loggers.bot.error(
        `Error handling Discord scheduled event update for ${newEvent.id}`,
        error,
      );
    }
  }
}

