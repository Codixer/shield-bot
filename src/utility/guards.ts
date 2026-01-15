import {
  Interaction,
  Client,
  GuildMember,
} from "discord.js";
import { Next } from "koa";
import { respondWithError } from "./generalUtils.js";
import { isLoggedInAndVerified } from "./vrchat.js";
import { userHasPermission, PermissionFlags } from "./permissionUtils.js";
import { getEnv } from "../config/env.js";
import { loggers } from "./logger.js";

/**
 * Helper function to check if interaction is in a guild
 */
async function requireGuild(
  interaction: Interaction,
): Promise<{ guildId: string; guild: NonNullable<Interaction["guild"]> } | null> {
  if (!interaction.guildId || !interaction.guild) {
    await respondWithError(
      interaction,
      "This command can only be used in a server.",
    );
    return null;
  }
  return { guildId: interaction.guildId, guild: interaction.guild };
}

/**
 * Guard to ensure command is run in a guild context
 */
export async function GuildGuard(
  interaction: Interaction,
  _client: Client,
  next: Next,
): Promise<unknown> {
  const guildCheck = await requireGuild(interaction);
  if (!guildCheck) {
    return undefined;
  }
  return next();
}

/**
 * Helper function to get guild member from interaction
 */
async function requireGuildMember(
  interaction: Interaction,
): Promise<GuildMember | null> {
  const guildCheck = await requireGuild(interaction);
  if (!guildCheck) {
    return null;
  }

  const member = interaction.member as GuildMember;
  if (!member) {
    await respondWithError(interaction, "Unable to verify your permissions.");
    return null;
  }
  return member;
}

/**
 * Helper function to check permission and respond with error if missing
 */
async function checkPermission(
  interaction: Interaction,
  member: GuildMember,
  permission: PermissionFlags,
  errorMessage: string,
): Promise<boolean> {
  const hasPermission = await userHasPermission(member, permission);
  if (!hasPermission) {
    await respondWithError(interaction, errorMessage);
    return false;
  }
  return true;
}

/**
 * Guard to ensure VRChat is logged in and verified
 */
export async function VRChatLoginGuard(
  interaction: Interaction,
  _client: Client,
  next: Next,
): Promise<unknown> {
  if (await isLoggedInAndVerified()) {
    return next();
  }

  return respondWithError(
    interaction,
    "Please inform staff of the following error: `VRChat is not logged in or otp verified`",
  );
}

/**
 * Guard to ensure user has attendance host permission
 */
export async function AttendanceHostGuard(
  interaction: Interaction,
  _client: Client,
  next: Next,
): Promise<unknown> {
  const member = await requireGuildMember(interaction);
  if (!member) {
    return undefined;
  }

  if (
    await checkPermission(
      interaction,
      member,
      PermissionFlags.HOST_ATTENDANCE,
      "You don't have permission to manage attendance.",
    )
  ) {
    return next();
  }
  return undefined;
}

/**
 * Guard to ensure user has shield member permission
 */
export async function ShieldMemberGuard(
  interaction: Interaction,
  _client: Client,
  next: Next,
): Promise<unknown> {
  const member = await requireGuildMember(interaction);
  if (!member) {
    return undefined;
  }

  if (
    await checkPermission(
      interaction,
      member,
      PermissionFlags.SHIELD_MEMBER,
      "You don't have permission to use this command. Shield member access required.",
    )
  ) {
    return next();
  }
  return undefined;
}

/**
 * Guard to ensure user is bot owner or has dev guard permission
 */
export async function BotOwnerGuard(
  interaction: Interaction,
  _client: Client,
  next: Next,
): Promise<unknown> {
  const env = getEnv();
  const botOwnerId = env.BOT_OWNER_ID;

  if (!botOwnerId) {
    loggers.bot.error("BOT_OWNER_ID environment variable is not set!");
    return respondWithError(
      interaction,
      "Bot configuration error. Please contact an administrator.",
    );
  }

  // First check if user is the configured bot owner
  if (interaction.user.id === botOwnerId) {
    return next();
  }
  
  return respondWithError(
    interaction,
    "This command is restricted to the bot owner.",
  );
}

/**
 * Guard to ensure user has dev guard permission
 */
export async function DevGuardGuard(
  interaction: Interaction,
  _client: Client,
  next: Next,
): Promise<unknown> {
  const member = await requireGuildMember(interaction);
  if (!member) {
    return undefined;
  }

  if (
    await checkPermission(
      interaction,
      member,
      PermissionFlags.DEV_GUARD,
      "You don't have permission to use this command. Dev guard access required.",
    )
  ) {
    return next();
  }
  return undefined;
}

/**
 * Guard to ensure user has staff permission
 */
export async function StaffGuard(
  interaction: Interaction,
  _client: Client,
  next: Next,
): Promise<unknown> {
  const member = await requireGuildMember(interaction);
  if (!member) {
    return undefined;
  }

  if (
    await checkPermission(
      interaction,
      member,
      PermissionFlags.STAFF,
      "You don't have permission to use this command. Staff access required.",
    )
  ) {
    return next();
  }
  return undefined;
}

/**
 * Guard to ensure user has trainer permission
 */
export async function TrainerGuard(
  interaction: Interaction,
  _client: Client,
  next: Next,
): Promise<unknown> {
  const member = await requireGuildMember(interaction);
  if (!member) {
    return undefined;
  }

  if (
    await checkPermission(
      interaction,
      member,
      PermissionFlags.TRAINER,
      "You don't have permission to use trainer commands. Trainer access required.",
    )
  ) {
    return next();
  }
  return undefined;
}
