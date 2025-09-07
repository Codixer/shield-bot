import { Discord, Slash, SlashGroup, SlashOption, SlashChoice } from "discordx";
import { ApplicationCommandOptionType, CommandInteraction, GuildMember, MessageFlags, InteractionContextType, ApplicationIntegrationType } from "discord.js";
import { prisma } from "../main.js";
import { userHasPermissionFromRoles, getUserPermissionLevelFromRoles, PermissionLevel } from "../utility/permissionUtils.js";

@Discord()
@SlashGroup({
  name: "user",
  description: "User management commands",
  contexts: [InteractionContextType.Guild],
  integrationTypes: [ApplicationIntegrationType.GuildInstall]
})
@SlashGroup("user")
export class UserCommands {

  @Slash({ name: "get-permission", description: "Check a user's current permission level." })
  async getPermission(
    @SlashOption({ name: "user", description: "User to check (defaults to yourself)", type: ApplicationCommandOptionType.User, required: false }) user: any,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId) return;

    const targetUserId = user?.id || interaction.user.id;

    try {
      // Get the target member
      const targetMember = interaction.guild?.members.cache.get(targetUserId);
      
      if (!targetMember) {
        await interaction.reply({
          content: "User not found in this server.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Get the user's permission level based on their roles
      const permissionLevel = await getUserPermissionLevelFromRoles(targetMember);
      const levelValue = this.getPermissionLevelValue(permissionLevel);

      await interaction.reply({
        content: `👤 **${targetMember.displayName}**\nPermission Level: **${permissionLevel}** (${levelValue})`,
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      console.error("Error getting user permission:", error);
      await interaction.reply({
        content: "❌ Failed to get user permission. Please try again.",
        flags: MessageFlags.Ephemeral
      });
    }
  }

  @Slash({ name: "list-permissions", description: "List all available permission levels and their associated roles." })
  async listPermissions(interaction: CommandInteraction) {
    const permissions = [
      "🔴 **BOT_OWNER** (100) - Full bot access (configured via BOT_OWNER_ID environment variable)",
      "🟠 **DEV_GUARD** (99) - Development and administrative access (requires Dev Guard role)",
      "🟡 **STAFF** (75) - Staff-level administrative access (requires Staff role)",
      "🟢 **TRAINER** (60) - Training and mentoring access (requires Trainer role) - *Cannot access Host Attendance commands*",
      "🟢 **HOST_ATTENDANCE** (50) - Can manage attendance events (requires Host Attendance role) - *Cannot access Trainer commands*",
      "🔵 **SHIELD_MEMBER** (25) - Shield member access (requires Shield Member role)",
      "⚪ **USER** (0) - Basic user access (default)"
    ];

    await interaction.reply({
      content: `📋 **Role-Based Permission System**\n\n` +
              `Permissions are automatically assigned based on Discord roles:\n\n` +
              `${permissions.join('\n')}\n\n` +
              `💡 **Note:** To change a user's permissions, assign/remove the appropriate Discord roles using server settings.`,
      flags: MessageFlags.Ephemeral
    });
  }

  // Helper method to get numeric value (duplicate from permissionUtils for simplicity)
  private getPermissionLevelValue(level: PermissionLevel): number {
    switch (level) {
      case PermissionLevel.BOT_OWNER: return 100;
      case PermissionLevel.DEV_GUARD: return 99;
      case PermissionLevel.STAFF: return 75;
      case PermissionLevel.TRAINER: return 60;
      case PermissionLevel.HOST_ATTENDANCE: return 50;
      case PermissionLevel.SHIELD_MEMBER: return 25;
      case PermissionLevel.USER: return 0;
      default: return 0;
    }
  }
}
