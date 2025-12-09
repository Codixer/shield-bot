import { ArgsOf, Discord, On } from "discordx";
import { calendarSyncManager } from "../../managers/calendarSync/calendarSyncManager.js";
import { loggers } from "../../utility/logger.js";
import { bot } from "../../main.js";
import { prisma } from "../../main.js";
import {
  EmbedBuilder,
  Colors,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";

@Discord()
export class GuildScheduledEventUpdateEvent {
  @On({ event: "guildScheduledEventUpdate" })
  async onGuildScheduledEventUpdate([_oldEvent, newEvent]: ArgsOf<"guildScheduledEventUpdate">) {
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

      if (result.success && result.vrchatEventId) {
        loggers.bot.info(
          `Successfully synced Discord event update ${newEvent.id} to VRChat calendar event ${result.vrchatEventId}`,
        );

        // Send notification to event creator
        await this.sendEventUpdateNotification(newEvent, result.vrchatEventId);
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

  /**
   * Send a DM notification to the event creator when event is updated
   */
  private async sendEventUpdateNotification(
    event: { id: string; name: string; description: string | null; scheduledStartTimestamp: number | null; scheduledEndTimestamp: number | null; guildId: string; creator?: { id: string } | null; creatorId?: string | null },
    vrchatEventId: string,
  ): Promise<void> {
    try {
      // Get the creator ID - GuildScheduledEvent has a creator property
      let creatorId: string | null = null;
      
      // Try to get creator from event.creator (if already fetched)
      if (event.creator?.id) {
        creatorId = event.creator.id;
      } else if (event.creatorId) {
        creatorId = event.creatorId;
      } else {
        // Try to fetch the event to get creator
        try {
          const guild = await bot.guilds.fetch(event.guildId);
          const fetchedEvent = await guild.scheduledEvents.fetch(event.id);
          creatorId = fetchedEvent.creatorId || fetchedEvent.creator?.id || null;
        } catch (fetchError) {
          loggers.bot.debug(
            `Could not fetch event ${event.id} to get creator: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
          );
        }
      }
      
      if (!creatorId) {
        loggers.bot.debug(
          `Could not find creator for Discord event ${event.id}, skipping notification`,
        );
        return;
      }

      // Get VRChat group ID for the URL
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: event.guildId },
      });

      if (!settings?.vrcGroupId) {
        loggers.bot.debug(
          `No VRChat group ID found for guild ${event.guildId}, skipping notification`,
        );
        return;
      }

      // Format dates using Discord timestamps
      const startDate = event.scheduledStartTimestamp
        ? `<t:${Math.floor(event.scheduledStartTimestamp / 1000)}:F>`
        : "Not set";
      const endDate = event.scheduledEndTimestamp
        ? `<t:${Math.floor(event.scheduledEndTimestamp / 1000)}:F>`
        : "Not set";

      // Create VRChat event URL
      const vrchatEventUrl = `https://vrchat.com/home/group/${settings.vrcGroupId}/calendar/${vrchatEventId}`;
      
      // Create Discord event URL
      const discordEventUrl = `https://discord.com/events/${event.guildId}/${event.id}`;

      // Build description with event details and links
      const descriptionParts: string[] = [
        `Your Discord scheduled event **"${event.name}"** has been updated and the changes have been synced to the VRChat group calendar!\n`,
        `**Updated Event Details:**`,
        `• **Name:** ${event.name}`,
        `• **Start:** ${startDate}`,
        `• **End:** ${endDate}`,
      ];

      if (event.description) {
        const maxDescLength = 500;
        const truncatedDesc = event.description.length > maxDescLength
          ? `${event.description.substring(0, maxDescLength)}...`
          : event.description;
        descriptionParts.push(`• **Description:** ${truncatedDesc}`);
      }

      descriptionParts.push(
        ``,
        `**Links:**`,
        `• [VRChat Event](${vrchatEventUrl})`,
        `• [Discord Event](${discordEventUrl})`,
      );

      const fullDescription = descriptionParts.join("\n");

      // Create embed
      const embed = new EmbedBuilder()
        .setTitle("🔄 Event Updated in VRChat Calendar")
        .setDescription(fullDescription.length > 4096 ? fullDescription.substring(0, 4093) + "..." : fullDescription)
        .setColor(Colors.Blue)
        .setFooter({ text: "S.H.I.E.L.D. Bot - Calendar Sync" })
        .setTimestamp();

      // Create buttons
      const vrchatButton = new ButtonBuilder()
        .setLabel("View on VRChat")
        .setStyle(ButtonStyle.Link)
        .setURL(vrchatEventUrl);

      const discordButton = new ButtonBuilder()
        .setLabel("View on Discord")
        .setStyle(ButtonStyle.Link)
        .setURL(discordEventUrl);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        vrchatButton,
        discordButton,
      );

      // Send DM to creator
      try {
        const creator = await bot.users.fetch(creatorId);
        await creator.send({
          embeds: [embed],
          components: [row],
        });
        loggers.bot.info(
          `Sent event update notification to ${creator.tag} for event ${event.id}`,
        );
      } catch (dmError) {
        // User might have DMs disabled
        loggers.bot.warn(
          `Failed to send DM to event creator ${creatorId}: ${dmError instanceof Error ? dmError.message : String(dmError)}`,
        );
      }
    } catch (error) {
      loggers.bot.error(
        `Error sending event update notification for event ${event.id}`,
        error,
      );
    }
  }
}

