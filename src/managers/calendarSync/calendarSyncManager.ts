// Calendar Sync Manager for Discord to VRChat event synchronization

import { prisma } from "../../main.js";
import {
  createVRChatCalendarEvent,
  updateVRChatCalendarEvent,
  deleteVRChatCalendarEvent,
} from "../../utility/vrchat/calendar.js";
import { GuildScheduledEvent } from "discord.js";
import { loggers } from "../../utility/logger.js";
import { VRChatError } from "../../utility/errors.js";

/**
 * Manager for syncing Discord scheduled events to VRChat calendar events
 */
export class CalendarSyncManager {
  /**
   * Check if an event should be synced (not started yet)
   * @param discordEvent Discord scheduled event
   * @returns True if event should be synced
   */
  shouldSyncEvent(discordEvent: GuildScheduledEvent): boolean {
    // Only sync events that haven't started yet
    if (!discordEvent.scheduledStartTimestamp) {
      return false;
    }
    
    const startTime = new Date(discordEvent.scheduledStartTimestamp);
    const now = new Date();
    
    return startTime > now;
  }

  /**
   * Get or create a sync record for a Discord event
   * @param discordEventId Discord scheduled event ID
   * @param guildId Discord guild ID
   * @param vrchatGroupId VRChat group ID
   * @returns The sync record
   */
  async getOrCreateSyncRecord(
    discordEventId: string,
    guildId: string,
    vrchatGroupId: string,
  ) {
    const existing = await prisma.discordEventSync.findUnique({
      where: { discordEventId },
    });

    if (existing) {
      return existing;
    }

    return await prisma.discordEventSync.create({
      data: {
        guildId,
        discordEventId,
        vrchatGroupId,
        lastSyncedAt: new Date(),
      },
    });
  }

  /**
   * Map Discord event data to VRChat calendar event format
   * @param discordEvent Discord scheduled event
   * @returns VRChat calendar event data
   */
  private mapDiscordEventToVRChat(discordEvent: GuildScheduledEvent) {
    const title = discordEvent.name;
    const startsAt = discordEvent.scheduledStartTimestamp
      ? new Date(discordEvent.scheduledStartTimestamp)
      : new Date();
    const endsAt = discordEvent.scheduledEndTimestamp
      ? new Date(discordEvent.scheduledEndTimestamp)
      : undefined;
    const description = discordEvent.description || undefined;

    return {
      title,
      startsAt,
      endsAt,
      description,
    };
  }

  /**
   * Main sync logic: Create or update VRChat calendar event from Discord event
   * @param discordEvent Discord scheduled event
   * @param guildId Discord guild ID
   * @returns Promise resolving to the sync result
   */
  async syncDiscordEventToVRChat(
    discordEvent: GuildScheduledEvent,
    guildId: string,
  ): Promise<{ success: boolean; vrchatEventId?: string; error?: string }> {
    try {
      // Check if guild has VRChat group configured
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId },
      });

      if (!settings?.vrcGroupId) {
        loggers.bot.debug(
          `Guild ${guildId} does not have vrcGroupId configured. Skipping sync.`,
        );
        return { success: false, error: "No VRChat group configured" };
      }

      const vrchatGroupId = settings.vrcGroupId;

      // Get or create sync record
      const syncRecord = await this.getOrCreateSyncRecord(
        discordEvent.id,
        guildId,
        vrchatGroupId,
      );

      // Map Discord event to VRChat format
      const eventData = this.mapDiscordEventToVRChat(discordEvent);

      let vrchatEventId: string | undefined;

      if (syncRecord.vrchatEventId) {
        // Event already exists in VRChat, update it
        // Only update if event hasn't started yet
        if (this.shouldSyncEvent(discordEvent)) {
          try {
            await updateVRChatCalendarEvent(
              vrchatGroupId,
              syncRecord.vrchatEventId,
              eventData,
            );
            vrchatEventId = syncRecord.vrchatEventId;

            loggers.bot.info(
              `Updated VRChat calendar event ${vrchatEventId} for Discord event ${discordEvent.id}`,
            );
          } catch (error) {
            // If update fails (e.g., event was deleted in VRChat), try creating a new one
            if (error instanceof VRChatError && error.statusCode === 404) {
              loggers.bot.warn(
                `VRChat event ${syncRecord.vrchatEventId} not found, creating new event`,
              );
              const result = await createVRChatCalendarEvent(
                vrchatGroupId,
                eventData,
              );
              vrchatEventId = result.id;
            } else {
              throw error;
            }
          }
        } else {
          loggers.bot.debug(
            `Discord event ${discordEvent.id} has already started, skipping update`,
          );
          return {
            success: true,
            vrchatEventId: syncRecord.vrchatEventId,
          };
        }
      } else {
        // Event doesn't exist in VRChat yet, create it
        // Only create if event hasn't started yet
        if (this.shouldSyncEvent(discordEvent)) {
          const result = await createVRChatCalendarEvent(
            vrchatGroupId,
            eventData,
          );
          vrchatEventId = result.id;
        } else {
          loggers.bot.debug(
            `Discord event ${discordEvent.id} has already started, skipping creation`,
          );
          return { success: false, error: "Event has already started" };
        }
      }

      // Update sync record with VRChat event ID and sync timestamp
      await prisma.discordEventSync.update({
        where: { id: syncRecord.id },
        data: {
          vrchatEventId,
          lastSyncedAt: new Date(),
        },
      });

      return { success: true, vrchatEventId };
    } catch (error) {
      loggers.bot.error(
        `Error syncing Discord event ${discordEvent.id} to VRChat`,
        error,
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Delete a VRChat calendar event when Discord event is deleted
   * @param discordEventId Discord scheduled event ID
   * @param guildId Discord guild ID
   * @returns Promise resolving to the deletion result
   */
  async deleteVRChatEvent(
    discordEventId: string,
    guildId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Find sync record
      const syncRecord = await prisma.discordEventSync.findUnique({
        where: { discordEventId },
      });

      if (!syncRecord || !syncRecord.vrchatEventId) {
        // No sync record or no VRChat event ID, nothing to delete
        return { success: true };
      }

      // Get guild settings to find VRChat group ID
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId },
      });

      if (!settings?.vrcGroupId) {
        // No group configured, just remove the sync record
        await prisma.discordEventSync.delete({
          where: { id: syncRecord.id },
        });
        return { success: true };
      }

      // Delete VRChat calendar event (using eventId parameter name)
      try {
        await deleteVRChatCalendarEvent(
          settings.vrcGroupId,
          syncRecord.vrchatEventId,
        );
        loggers.bot.info(
          `Deleted VRChat calendar event ${syncRecord.vrchatEventId} for Discord event ${discordEventId}`,
        );
      } catch (error) {
        // If deletion fails (e.g., event already deleted), log but continue
        if (error instanceof VRChatError && error.statusCode === 404) {
          loggers.bot.debug(
            `VRChat event ${syncRecord.vrchatEventId} not found, may have been already deleted`,
          );
        } else {
          loggers.bot.warn(
            `Failed to delete VRChat calendar event ${syncRecord.vrchatEventId}`,
            error,
          );
          // Continue to remove sync record even if deletion fails
        }
      }

      // Remove sync record
      await prisma.discordEventSync.delete({
        where: { id: syncRecord.id },
      });

      return { success: true };
    } catch (error) {
      loggers.bot.error(
        `Error deleting VRChat event for Discord event ${discordEventId}`,
        error,
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const calendarSyncManager = new CalendarSyncManager();

