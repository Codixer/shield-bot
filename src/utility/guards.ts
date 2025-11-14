import {
  Interaction,
  Client,
  GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import { Next } from "koa";
import { respondWithError } from "./generalUtils.js";
import { isLoggedInAndVerified } from "./vrchat.js";
import { userHasPermission, PermissionFlags } from "./permissionUtils.js";

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

export async function AttendanceHostGuard(
  interaction: Interaction,
  _client: Client,
  next: Next,
): Promise<unknown> {
  if (!interaction.guildId || !interaction.guild) {
    return respondWithError(
      interaction,
      "This command can only be used in a server.",
    );
  }

  const member = interaction.member as GuildMember;
  if (!member) {
    return respondWithError(interaction, "Unable to verify your permissions.");
  }

  // Check if user has HOST_ATTENDANCE permission based on their roles
  if (await userHasPermission(member, PermissionFlags.HOST_ATTENDANCE)) {
    return next();
  }

  return respondWithError(
    interaction,
    "You don't have permission to manage attendance.",
  );
}

export async function ShieldMemberGuard(
  interaction: Interaction,
  _client: Client,
  next: Next,
): Promise<unknown> {
  if (!interaction.guildId || !interaction.guild) {
    return respondWithError(
      interaction,
      "This command can only be used in a server.",
    );
  }

  const member = interaction.member as GuildMember;
  if (!member) {
    return respondWithError(interaction, "Unable to verify your permissions.");
  }

  // Check if user has SHIELD_MEMBER permission based on their roles
  if (await userHasPermission(member, PermissionFlags.SHIELD_MEMBER)) {
    return next();
  }

  return respondWithError(
    interaction,
    "You don't have permission to use this command. Shield member access required.",
  );
}

export async function BotOwnerGuard(
  interaction: Interaction,
  _client: Client,
  next: Next,
): Promise<unknown> {
  const botOwnerId = process.env.BOT_OWNER_ID;

  if (!botOwnerId) {
    console.error("BOT_OWNER_ID environment variable is not set!");
    return respondWithError(
      interaction,
      "Bot configuration error. Please contact an administrator.",
    );
  }

  // First check if user is the configured bot owner
  if (interaction.user.id === botOwnerId) {
    return next();
  }

  // Also check if user has DEV_GUARD role (for additional bot owners)
  if (interaction.guildId && interaction.guild) {
    const member = interaction.member as GuildMember;
    if (
      member &&
      (await userHasPermission(member, PermissionFlags.DEV_GUARD))
    ) {
      return next();
    }
  }

  return respondWithError(
    interaction,
    "This command is restricted to the bot owner.",
  );
}

export async function DevGuardGuard(
  interaction: Interaction,
  _client: Client,
  next: Next,
): Promise<unknown> {
  if (!interaction.guildId || !interaction.guild) {
    return respondWithError(
      interaction,
      "This command can only be used in a server.",
    );
  }

  const member = interaction.member as GuildMember;
  if (!member) {
    return respondWithError(interaction, "Unable to verify your permissions.");
  }

  // Check if user has DEV_GUARD permission based on their roles
  if (await userHasPermission(member, PermissionFlags.DEV_GUARD)) {
    return next();
  }

  return respondWithError(
    interaction,
    "You don't have permission to use this command. Dev guard access required.",
  );
}

export async function StaffGuard(
  interaction: Interaction,
  _client: Client,
  next: Next,
): Promise<unknown> {
  if (!interaction.guildId || !interaction.guild) {
    return respondWithError(
      interaction,
      "This command can only be used in a server.",
    );
  }

  const member = interaction.member as GuildMember;
  if (!member) {
    return respondWithError(interaction, "Unable to verify your permissions.");
  }

  // Check if user has STAFF permission based on their roles
  if (await userHasPermission(member, PermissionFlags.STAFF)) {
    return next();
  }

  return respondWithError(
    interaction,
    "You don't have permission to use this command. Staff access required.",
  );
}

export async function DevGuardAndStaffGuard(
  interaction: Interaction,
  _client: Client,
  next: Next,
): Promise<unknown> {
  if (!interaction.guildId || !interaction.guild) {
    return respondWithError(
      interaction,
      "This command can only be used in a server.",
    );
  }

  const member = interaction.member as GuildMember;
  if (!member) {
    return respondWithError(interaction, "Unable to verify your permissions.");
  }

  // Check if user has DEV_GUARD permission based on their roles
  if (await userHasPermission(member, PermissionFlags.DEV_GUARD) || 
      await userHasPermission(member, PermissionFlags.STAFF)) {
    return next();
  }

  return respondWithError(
    interaction,
    "You don't have permission to use this command. Dev guard access required.",
  );
}

export async function TrainerGuard(
  interaction: Interaction,
  _client: Client,
  next: Next,
): Promise<unknown> {
  if (!interaction.guildId || !interaction.guild) {
    return respondWithError(
      interaction,
      "This command can only be used in a server.",
    );
  }

  const member = interaction.member as GuildMember;
  if (!member) {
    return respondWithError(interaction, "Unable to verify your permissions.");
  }

  // Check if user has TRAINER permission based on their roles
  if (await userHasPermission(member, PermissionFlags.TRAINER)) {
    return next();
  }

  return respondWithError(
    interaction,
    "You don't have permission to use trainer commands. Trainer access required.",
  );
}
