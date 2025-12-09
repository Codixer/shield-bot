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
export class GuildScheduledEventDeleteEvent {
  @On({ event: "guildScheduledEventDelete" })
  async onGuildScheduledEventDelete([event]: ArgsOf<"guildScheduledEventDelete">) {
    try {
      loggers.bot.debug(
        `Discord scheduled event deleted: ${event.name} (${event.id}) in guild ${event.guildId}`,
      );

      // Get VRChat event ID before deletion for notification
      const syncRecord = await prisma.discordEventSync.findUnique({
        where: { discordEventId: event.id },
      });

      const vrchatEventId = syncRecord?.vrchatEventId;

      // Delete corresponding VRChat calendar event
      const result = await calendarSyncManager.deleteVRChatEvent(
        event.id,
        event.guildId,
      );

      if (result.success) {
        loggers.bot.info(
          `Successfully deleted VRChat calendar event for Discord event ${event.id}`,
        );

        // Send notification to event creator
        // Handle partial event type (deleted events may have nullable properties)
        if (vrchatEventId && event.name && event.guildId) {
          await this.sendEventDeletionNotification(
            {
              id: event.id,
              name: event.name,
              description: event.description ?? null,
              scheduledStartTimestamp: event.scheduledStartTimestamp ?? null,
              scheduledEndTimestamp: event.scheduledEndTimestamp ?? null,
              guildId: event.guildId,
              creator: event.creator ?? null,
              creatorId: event.creatorId ?? null,
            },
            vrchatEventId,
          );
        }
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

  /**
   * Send a DM notification to the event creator when event is deleted
   */
  private async sendEventDeletionNotification(
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
        // Try to fetch from cache or database if event is already deleted
        // Since the event is deleted, we can't fetch it, so try to get from audit logs or skip
        loggers.bot.debug(
          `Could not get creator for deleted event ${event.id}, skipping notification`,
        );
        return;
      }
      
      if (!creatorId) {
        loggers.bot.debug(
          `Could not find creator for Discord event ${event.id}, skipping notification`,
        );
        return;
      }

      // Get VRChat group ID for the URL (even though event is deleted, we can still show the link)
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: event.guildId },
      });

      // Format dates
      const startDate = event.scheduledStartTimestamp
        ? new Date(event.scheduledStartTimestamp).toLocaleString()
        : "Not set";
      const endDate = event.scheduledEndTimestamp
        ? new Date(event.scheduledEndTimestamp).toLocaleString()
        : "Not set";

      // Create Discord event URL (event is deleted but link might still work for a short time)
      const discordEventUrl = `https://discord.com/events/${event.guildId}/${event.id}`;

      // Build description
      const descriptionParts: string[] = [
        `Your Discord scheduled event **"${event.name}"** has been deleted, and the corresponding VRChat calendar event has been removed.\n`,
        `**Deleted Event Details:**`,
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
        `**Note:** The VRChat calendar event has been automatically deleted.`,
        ``,
        `**Link:**`,
        `• [Discord Event](${discordEventUrl})`,
      );

      // Add VRChat link if we have the group ID (even though event is deleted)
      if (settings?.vrcGroupId) {
        const vrchatEventUrl = `https://vrchat.com/home/group/${settings.vrcGroupId}/events/${vrchatEventId}`;
        descriptionParts.push(`• [VRChat Event (deleted)](${vrchatEventUrl})`);
      }

      const fullDescription = descriptionParts.join("\n");

      // Create embed
      const embed = new EmbedBuilder()
        .setTitle("🗑️ Event Deleted from VRChat Calendar")
        .setDescription(fullDescription.length > 4096 ? fullDescription.substring(0, 4093) + "..." : fullDescription)
        .setColor(Colors.Red)
        .setFooter({ text: "S.H.I.E.L.D. Bot - Calendar Sync" })
        .setTimestamp();

      // Create buttons
      const buttons: ButtonBuilder[] = [];

      const discordButton = new ButtonBuilder()
        .setLabel("View on Discord")
        .setStyle(ButtonStyle.Link)
        .setURL(discordEventUrl);
      buttons.push(discordButton);

      // Add VRChat button if we have the group ID
      if (settings?.vrcGroupId) {
        const vrchatEventUrl = `https://vrchat.com/home/group/${settings.vrcGroupId}/events/${vrchatEventId}`;
        const vrchatButton = new ButtonBuilder()
          .setLabel("View on VRChat")
          .setStyle(ButtonStyle.Link)
          .setURL(vrchatEventUrl);
        buttons.push(vrchatButton);
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

      // Send DM to creator
      try {
        const creator = await bot.users.fetch(creatorId);
        await creator.send({
          embeds: [embed],
          components: buttons.length > 0 ? [row] : [],
        });
        loggers.bot.info(
          `Sent event deletion notification to ${creator.tag} for event ${event.id}`,
        );
      } catch (dmError) {
        // User might have DMs disabled
        loggers.bot.warn(
          `Failed to send DM to event creator ${creatorId}: ${dmError instanceof Error ? dmError.message : String(dmError)}`,
        );
      }
    } catch (error) {
      loggers.bot.error(
        `Error sending event deletion notification for event ${event.id}`,
        error,
      );
    }
  }
}

