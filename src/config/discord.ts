/**
 * Discord-specific configuration constants
 */

import { IntentsBitField } from "discord.js";

/**
 * Bot intents required for functionality
 */
export const BOT_INTENTS = [
  IntentsBitField.Flags.Guilds,
  IntentsBitField.Flags.GuildMembers,
  IntentsBitField.Flags.GuildVoiceStates,
  IntentsBitField.Flags.GuildScheduledEvents,
] as const;

/**
 * Bot configuration
 */
export const BOT_CONFIG = {
  silent: false,
} as const;

