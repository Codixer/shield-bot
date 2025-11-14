import { PermissionLevel } from "@prisma/client";
import { GuildMember } from "discord.js";
import { prisma, bot } from "../main.js";

export { PermissionLevel };

// Define permissions as bit flags for clean, scalable permission system
export enum PermissionFlags {
  // Core permissions
  BASIC_ACCESS = 1 << 0, // 1 - Basic user access
  SHIELD_MEMBER = 1 << 1, // 2 - Shield member access
  HOST_ATTENDANCE = 1 << 2, // 4 - Can manage attendance
  TRAINER = 1 << 3, // 8 - Training access
  STAFF = 1 << 4, // 16 - Staff access
  DEV_GUARD = 1 << 5, // 32 - Dev guard access
  BOT_OWNER = 1 << 6, // 64 - Full bot access

  // Combined permissions for convenience
  ALL_PERMISSIONS = (1 << 7) - 1, // All permissions combined
}

// Permission sets for each role (clean and maintainable)
const ROLE_PERMISSIONS: Record<PermissionLevel, number> = {
  [PermissionLevel.USER]: PermissionFlags.BASIC_ACCESS,
  [PermissionLevel.SHIELD_MEMBER]:
    PermissionFlags.BASIC_ACCESS | PermissionFlags.SHIELD_MEMBER,
  [PermissionLevel.HOST_ATTENDANCE]:
    PermissionFlags.BASIC_ACCESS |
    PermissionFlags.SHIELD_MEMBER |
    PermissionFlags.HOST_ATTENDANCE,
  [PermissionLevel.TRAINER]:
    PermissionFlags.BASIC_ACCESS |
    PermissionFlags.SHIELD_MEMBER |
    PermissionFlags.TRAINER,
  [PermissionLevel.STAFF]:
    PermissionFlags.BASIC_ACCESS |
    PermissionFlags.SHIELD_MEMBER |
    PermissionFlags.HOST_ATTENDANCE |
    PermissionFlags.TRAINER |
    PermissionFlags.STAFF,
  [PermissionLevel.DEV_GUARD]:
    PermissionFlags.BASIC_ACCESS |
    PermissionFlags.SHIELD_MEMBER |
    PermissionFlags.HOST_ATTENDANCE |
    PermissionFlags.TRAINER |
    PermissionFlags.DEV_GUARD,
  [PermissionLevel.BOT_OWNER]: PermissionFlags.ALL_PERMISSIONS,
};

// Legacy function for backward compatibility
export function getPermissionLevelValue(level: PermissionLevel): number {
  switch (level) {
    case PermissionLevel.BOT_OWNER:
      return 100;
    case PermissionLevel.DEV_GUARD:
      return 99;
    case PermissionLevel.STAFF:
      return 75;
    case PermissionLevel.TRAINER:
      return 60;
    case PermissionLevel.HOST_ATTENDANCE:
      return 50;
    case PermissionLevel.SHIELD_MEMBER:
      return 25;
    case PermissionLevel.USER:
      return 0;
    default:
      return 0;
  }
}

// Clean permission checking using bitmask system
export function hasPermission(
  userLevel: PermissionLevel,
  requiredPermission: PermissionFlags,
): boolean {
  const userPermissions = ROLE_PERMISSIONS[userLevel];
  return (userPermissions & requiredPermission) === requiredPermission;
}

// Check if user has specific permission based on their roles
export async function userHasPermission(
  member: GuildMember,
  requiredPermission: PermissionFlags,
): Promise<boolean> {
  const userLevel = await getUserPermissionLevelFromRoles(member);
  return hasPermission(userLevel, requiredPermission);
}

// Check if user has a specific role type (not just permissions inherited from higher roles)
export async function userHasSpecificRole(
  member: GuildMember,
  roleType: PermissionLevel,
): Promise<boolean> {
  const botOwnerId = process.env.BOT_OWNER_ID;

  // Check bot owner
  if (roleType === PermissionLevel.BOT_OWNER) {
    return member.id === botOwnerId;
  }

  // Get guild settings for role mappings
  const settings = await prisma.guildSettings.findUnique({
    where: { guildId: member.guild.id },
  });

  if (!settings) {
    return false;
  }

  // Check each specific role type
  switch (roleType) {
    case PermissionLevel.DEV_GUARD:
      return !!(
        settings.devGuardRoleIds &&
        Array.isArray(settings.devGuardRoleIds) &&
        (settings.devGuardRoleIds as string[]).some((roleId) =>
          member.roles.cache.has(roleId),
        )
      );

    case PermissionLevel.STAFF:
      return !!(
        settings.staffRoleIds &&
        Array.isArray(settings.staffRoleIds) &&
        (settings.staffRoleIds as string[]).some((roleId) =>
          member.roles.cache.has(roleId),
        )
      );

    case PermissionLevel.TRAINER:
      return !!(
        settings.trainerRoleIds &&
        Array.isArray(settings.trainerRoleIds) &&
        (settings.trainerRoleIds as string[]).some((roleId) =>
          member.roles.cache.has(roleId),
        )
      );

    case PermissionLevel.HOST_ATTENDANCE:
      return !!(
        settings.hostAttendanceRoleIds &&
        Array.isArray(settings.hostAttendanceRoleIds) &&
        (settings.hostAttendanceRoleIds as string[]).some((roleId) =>
          member.roles.cache.has(roleId),
        )
      );

    case PermissionLevel.SHIELD_MEMBER:
      return !!(
        settings.shieldMemberRoleIds &&
        Array.isArray(settings.shieldMemberRoleIds) &&
        (settings.shieldMemberRoleIds as string[]).some((roleId) =>
          member.roles.cache.has(roleId),
        )
      );

    default:
      return false;
  }
}

// New function to get permission level based on Discord roles
export async function getUserPermissionLevelFromRoles(
  member: GuildMember,
): Promise<PermissionLevel> {
  const botOwnerId = process.env.BOT_OWNER_ID;

  if (!botOwnerId) {
    console.error("BOT_OWNER_ID environment variable is not set!");
    return PermissionLevel.USER;
  }

  // Check if user is the configured bot owner
  if (member.id === botOwnerId) {
    return PermissionLevel.BOT_OWNER;
  }

  // Get guild settings for role mappings
  const settings = await prisma.guildSettings.findUnique({
    where: { guildId: member.guild.id },
  });

  if (!settings) {
    return PermissionLevel.USER;
  }

  // Check roles in hierarchical order (highest first)
  if (
    settings.devGuardRoleIds &&
    Array.isArray(settings.devGuardRoleIds) &&
    (settings.devGuardRoleIds as string[]).some((roleId) =>
      member.roles.cache.has(roleId),
    )
  ) {
    return PermissionLevel.DEV_GUARD;
  }

  if (
    settings.staffRoleIds &&
    Array.isArray(settings.staffRoleIds) &&
    (settings.staffRoleIds as string[]).some((roleId) =>
      member.roles.cache.has(roleId),
    )
  ) {
    return PermissionLevel.STAFF;
  }

  if (
    settings.trainerRoleIds &&
    Array.isArray(settings.trainerRoleIds) &&
    (settings.trainerRoleIds as string[]).some((roleId) =>
      member.roles.cache.has(roleId),
    )
  ) {
    return PermissionLevel.TRAINER;
  }

  if (
    settings.hostAttendanceRoleIds &&
    Array.isArray(settings.hostAttendanceRoleIds) &&
    (settings.hostAttendanceRoleIds as string[]).some((roleId) =>
      member.roles.cache.has(roleId),
    )
  ) {
    return PermissionLevel.HOST_ATTENDANCE;
  }

  if (
    settings.shieldMemberRoleIds &&
    Array.isArray(settings.shieldMemberRoleIds) &&
    (settings.shieldMemberRoleIds as string[]).some((roleId) =>
      member.roles.cache.has(roleId),
    )
  ) {
    return PermissionLevel.SHIELD_MEMBER;
  }

  // Default to USER level
  return PermissionLevel.USER;
}

// Helper function to check if user has permission based on their roles
export async function userHasPermissionFromRoles(
  member: GuildMember,
  requiredLevel: PermissionLevel,
): Promise<boolean> {
  const userLevel = await getUserPermissionLevelFromRoles(member);

  // For backward compatibility, convert PermissionLevel to PermissionFlags
  const requiredPermission = getPermissionFlagsFromLevel(requiredLevel);
  return hasPermission(userLevel, requiredPermission);
}

// Convert PermissionLevel to PermissionFlags for backward compatibility
function getPermissionFlagsFromLevel(level: PermissionLevel): PermissionFlags {
  switch (level) {
    case PermissionLevel.USER:
      return PermissionFlags.BASIC_ACCESS;
    case PermissionLevel.SHIELD_MEMBER:
      return PermissionFlags.SHIELD_MEMBER;
    case PermissionLevel.HOST_ATTENDANCE:
      return PermissionFlags.HOST_ATTENDANCE;
    case PermissionLevel.TRAINER:
      return PermissionFlags.TRAINER;
    case PermissionLevel.STAFF:
      return PermissionFlags.STAFF;
    case PermissionLevel.DEV_GUARD:
      return PermissionFlags.DEV_GUARD;
    case PermissionLevel.BOT_OWNER:
      return PermissionFlags.BOT_OWNER;
    default:
      return PermissionFlags.BASIC_ACCESS;
  }
}
