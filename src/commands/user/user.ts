import { Discord, Slash, SlashGroup, SlashOption, Guard } from "discordx";
import {
  ApplicationCommandOptionType,
  CommandInteraction,
  MessageFlags,
  User,
  Role,
  EmbedBuilder,
} from "discord.js";
import { Pagination } from "@discordx/pagination";
import {
  getUserPermissionLevelFromRoles,
  PermissionLevel,
} from "../../utility/permissionUtils.js";
import { loggers } from "../../utility/logger.js";
import { GuildGuard, StaffGuard } from "../../utility/guards.js";

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

  @Slash({
    name: "list",
    description: "List all members with a specific role, or members with no roles if no role is selected",
  })
  @Guard(StaffGuard)
  async list(
    @SlashOption({
      name: "role",
      description: "Role to filter by (optional, if not provided lists members with no roles)",
      type: ApplicationCommandOptionType.Role,
      required: false,
    })
    role: Role | null,
    interaction: CommandInteraction,
  ): Promise<void> {
    try {
      if (!interaction.guild) {
        await interaction.reply({
          content: "❌ This command can only be used in a server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply();

      // Fetch all guild members
      const guild = interaction.guild;
      const allMembers = await guild.members.fetch();

      // Filter members based on role parameter
      let filteredMembers: Array<[string, import("discord.js").GuildMember]>;
      let title: string;

      if (role) {
        // Filter members with the specified role
        filteredMembers = Array.from(allMembers.filter((member) =>
          member.roles.cache.has(role.id),
        ));
        title = `Members with role: ${role.name}`;
      } else {
        // Filter members with no roles (only @everyone)
        filteredMembers = Array.from(
          allMembers.filter(
            (member) =>
              member.roles.cache.filter((r) => r.id !== member.guild.id).size ===
              0,
          ),
        );
        title = "Members with no roles";
      }

      if (filteredMembers.length === 0) {
        await interaction.editReply({
          content: `❌ No members found${
            role ? ` with role ${role.name}` : " with no roles"
          }.`,
        });
        return;
      }

      // Calculate optimal items per page
      // Format: **{index}.** <@{userId}> (${member.user.tag})
      // Approximate: ~50 chars per user (with index, mention, tag)
      // Target: ~80-90 users per page, leaving buffer for footer
      const maxDescriptionLength = 4000; // Leave buffer for embed overhead
      const avgUserLength = 50; // Approximate characters per user entry
      const itemsPerPage = Math.floor(maxDescriptionLength / avgUserLength);

      // Build pagination pages
      const totalPages = Math.ceil(filteredMembers.length / itemsPerPage);
      const pages: Array<{ embeds: EmbedBuilder[] }> = [];

      for (let i = 0; i < filteredMembers.length; i += itemsPerPage) {
        const chunk = filteredMembers.slice(i, i + itemsPerPage);
        const description = chunk
          .map(([, member], index) => {
            const listIndex = i + index + 1;
            return `**${listIndex}.** <@${member.id}> (${member.user.tag})`;
          })
          .join("\n");

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setColor(0x0099ff)
          .setDescription(description)
          .setFooter({
            text: `Page ${Math.floor(i / itemsPerPage) + 1} of ${totalPages} • Total: ${filteredMembers.length} members`,
          })
          .setTimestamp();

        pages.push({ embeds: [embed] });
      }

      if (pages.length === 1) {
        await interaction.editReply(pages[0]);
        return;
      }

      const pagination = new Pagination(interaction, pages, {
        time: 120_000,
      });

      await pagination.send();
    } catch (error: unknown) {
      loggers.bot.error("Error listing members", error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `❌ Failed to list members: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      } else {
        await interaction.reply({
          content: `❌ Failed to list members: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          flags: MessageFlags.Ephemeral,
        });
      }
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
