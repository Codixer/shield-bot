import { Client } from "discord.js";
import * as cron from "node-cron";
import { loggers } from "../../utility/logger.js";
import { prisma, patrolTimer } from "../../main.js";


/**
 * Convert milliseconds to readable format (e.g., "2d 5h 30m 15s")
 */
function msToReadable(ms: number): string {
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const parts: string[] = [];
  if (days) {parts.push(`${days}d`);}
  if (hours) {parts.push(`${hours}h`);}
  if (minutes) {parts.push(`${minutes}m`);}
  if (seconds || parts.length === 0) {parts.push(`${seconds}s`);}
  return parts.join(" ");
}

/**
 * Post patrol top to all configured channels
 */
export async function postPatrolTop(client: Client): Promise<void> {
  try {
    loggers.schedules.info("Starting patrol top posting job...");

    // Get all guilds with patrolTopChannelId configured
    const guildSettings = await prisma.guildSettings.findMany({
      where: {
        patrolTopChannelId: {
          not: null,
        },
      },
    });

    if (guildSettings.length === 0) {
      loggers.schedules.info("No guilds configured with patrolTopChannelId");
      return;
    }

    loggers.schedules.info(`Posting patrol top to ${guildSettings.length} guild(s)`);

    // Process each guild
    for (const settings of guildSettings) {
      if (!settings.patrolTopChannelId || !settings.guildId) {
        continue;
      }

      try {
        // Get the guild and channel
        const guild = client.guilds.cache.get(settings.guildId);
        if (!guild) {
          loggers.schedules.warn(`Guild ${settings.guildId} not found`);
          continue;
        }

        const channel = guild.channels.cache.get(settings.patrolTopChannelId);
        if (!channel) {
          loggers.schedules.warn(`Channel ${settings.patrolTopChannelId} not found in guild ${settings.guildId}`);
          continue;
        }

        if (!channel.isTextBased()) {
          loggers.schedules.warn(`Channel ${settings.patrolTopChannelId} is not a text-based channel`);
          continue;
        }

        // Get top users (all-time, limit 25)
        const rows = await patrolTimer.getTop(settings.guildId, 25);

        if (rows.length === 0) {
          loggers.schedules.info(`No patrol data found for guild ${settings.guildId}`);
          await channel.send("**Weekly Patrol Top**\nNo data available.");
          continue;
        }

        // Format the message
        const lines = rows.map(
          (r, idx) => `${idx + 1}. <@${r.userId}> — ${msToReadable(Number(r.totalMs))}`,
        );
        const header = "**Weekly Patrol Top (All-Time):**\n";
        const content = header + lines.join("\n");

        // Post the message
        await channel.send(content);
        loggers.schedules.info(`Posted patrol top to channel ${settings.patrolTopChannelId} in guild ${settings.guildId}`);
      } catch (error) {
        loggers.schedules.error(
          `Failed to post patrol top for guild ${settings.guildId}`,
          error,
        );
      }
    }

    loggers.schedules.info("Patrol top posting job completed");
  } catch (error) {
    loggers.schedules.error("Error in patrol top posting job", error);
  }
}

/**
 * Initialize the patrol top cron job
 */
export function initializePatrolTopSchedule(client: Client): cron.ScheduledTask {
  loggers.schedules.info("Initializing patrol top schedule...");

  // Schedule patrol top to run at 3AM on Sunday every week
  // Cron format: minute hour day month day-of-week
  // SUN = Sunday, 3 = 3AM
  const job = cron.schedule("0 3 * * SUN", async () => {
    loggers.schedules.info("Cron job triggered: Patrol top posting");
    await postPatrolTop(client);
  });

  loggers.schedules.info("Patrol top schedule initialized. Will run at 3AM UTC every Sunday.");
  return job;
}

/**
 * Stop the patrol top cron job
 */
export function stopPatrolTopSchedule(job: cron.ScheduledTask | null): void {
  if (job) {
    job.stop();
    loggers.schedules.info("Patrol top schedule stopped.");
  }
}

