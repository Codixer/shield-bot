import { Discord, Slash, SlashGroup, SlashOption, Guard } from "discordx";
import {
  ApplicationCommandOptionType,
  CommandInteraction,
  MessageFlags,
  User,
} from "discord.js";
import {
  getUserPermissionLevelFromRoles,
  PermissionLevel,
} from "../../utility/permissionUtils.js";
import { loggers } from "../../utility/logger.js";
import { GuildGuard } from "../../utility/guards.js";

@Discord()
@SlashGroup({
  name: "user",
  description: "User management commands",
})
@SlashGroup("user")
export class UserCommands {
  @Slash({
    name: "permission",
    description: "Check user permissions or list all permission levels.",
  })
  @Guard(GuildGuard)
  async permission(
    @SlashOption({
      name: "user",
      description: "User to check (optional, if not provided lists all permission levels)",
      type: ApplicationCommandOptionType.User,
      required: false,
    })
    user: User | null,
    interaction: CommandInteraction,
  ) {
    // If no user provided, list all permissions
    if (!user) {
      const permissions = [
        "🔴 **BOT_OWNER** (100) - Full bot access (configured via BOT_OWNER_ID environment variable)",
        "🟠 **STAFF** (80) - Staff-level administrative access (requires Staff role)",
        "🟡 **DEV_GUARD** (75) - Development and administrative access (requires Dev Guard role)",
        "🟢 **TRAINER** (60) - Training and mentoring access (requires Trainer role) - *Cannot access Host Attendance commands*",
        "🟢 **HOST_ATTENDANCE** (50) - Can manage attendance events (requires Host Attendance role) - *Cannot access Trainer commands*",
        "🔵 **SHIELD_MEMBER** (25) - Shield member access (requires Shield Member role)",
        "⚪ **USER** (0) - Basic user access (default)",
      ];

      await interaction.reply({
        content:
          `📋 **Role-Based Permission System**\n\n` +
          `Permissions are automatically assigned based on Discord roles:\n\n` +
          `${permissions.join("\n")}\n\n` +
          `💡 **Note:** To change a user's permissions, assign/remove the appropriate Discord roles using server settings.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get specific user's permission
    const targetUserId = user.id;

    try {
      // Get the target member
      const targetMember = interaction.guild?.members.cache.get(targetUserId);

      if (!targetMember) {
        await interaction.reply({
          content: "User not found in this server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Get the user's permission level based on their roles
      const permissionLevel =
        await getUserPermissionLevelFromRoles(targetMember);
      const levelValue = this.getPermissionLevelValue(permissionLevel);

      await interaction.reply({
        content: `👤 **${targetMember.displayName}**\nPermission Level: **${permissionLevel}** (${levelValue})`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      loggers.bot.error("Error getting user permission", error);
      await interaction.reply({
        content: "❌ Failed to get user permission. Please try again.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // Helper method to get numeric value (duplicate from permissionUtils for simplicity)
  private getPermissionLevelValue(level: PermissionLevel): number {
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
}
