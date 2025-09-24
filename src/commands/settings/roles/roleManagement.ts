import { Discord, Slash, SlashGroup, SlashOption, SlashChoice, Guard } from "discordx";
import { ApplicationCommandOptionType, CommandInteraction, PermissionFlagsBits, Role, MessageFlags, EmbedBuilder } from "discord.js";
import { prisma } from "../../../main.js";
import { DevGuardAndStaffGuard } from "../../../utility/guards.js";

// This class only defines the subgroup commands for settings -> roles
@Discord()
// Define subgroup metadata and attach
@SlashGroup({
  description: "Role settings",
  name: "roles",
  root: "settings"
})
@SlashGroup("roles", "settings")
@Guard(DevGuardAndStaffGuard)
export class SettingsRolesManagementSubGroup {

  @Slash({ name: "add", description: "Add a role to a permission level" })
  async addRole(
    @SlashChoice("dev-guard", "staff", "trainer", "host-attendance", "shield-member")
    @SlashOption({ name: "type", description: "Permission level type", type: ApplicationCommandOptionType.String, required: true }) type: string,
    @SlashOption({ name: "role", description: "Discord role to add", type: ApplicationCommandOptionType.Role, required: true }) role: Role,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId || !interaction.guild) return;

    try {
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId }
      });

      const fieldName = getFieldName(type);
      const settingsAny = settings as any; // Type assertion for dynamic access
      const currentRoles = settingsAny?.[fieldName] ? (settingsAny[fieldName] as string[]) : [];

      if (currentRoles.includes(role.id)) {
        await interaction.reply({ content: `Role ${role.name} is already assigned to ${type}.`, flags: MessageFlags.Ephemeral });
        return;
      }

      const updatedRoles = [...currentRoles, role.id];

      await prisma.guildSettings.upsert({
        where: { guildId: interaction.guildId },
        update: { [fieldName]: updatedRoles },
        create: { guildId: interaction.guildId, [fieldName]: [role.id] }
      });

      await interaction.reply({ content: `Added ${role.name} to ${type} roles.`, flags: MessageFlags.Ephemeral });
    } catch (error) {
      console.error(`Error adding ${type} role:`, error);
      await interaction.reply({ content: "Failed to add role. Please try again.", flags: MessageFlags.Ephemeral });
    }
  }

  @Slash({ name: "remove", description: "Remove a role from a permission level" })
  async removeRole(
    @SlashChoice("dev-guard", "staff", "trainer", "host-attendance", "shield-member")
    @SlashOption({ name: "type", description: "Permission level type", type: ApplicationCommandOptionType.String, required: true }) type: string,
    @SlashOption({ name: "role", description: "Discord role to remove", type: ApplicationCommandOptionType.Role, required: true }) role: Role,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId || !interaction.guild) return;

    try {
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId }
      });

      const fieldName = getFieldName(type);
      const settingsAny = settings as any; // Type assertion for dynamic access

      if (!settingsAny?.[fieldName] || !Array.isArray(settingsAny[fieldName])) {
        await interaction.reply({ content: `No ${type} roles configured.`, flags: MessageFlags.Ephemeral });
        return;
      }

      const currentRoles = settingsAny[fieldName] as string[];
      if (!currentRoles.includes(role.id)) {
        await interaction.reply({ content: `Role ${role.name} is not assigned to ${type}.`, flags: MessageFlags.Ephemeral });
        return;
      }

      const updatedRoles = currentRoles.filter(id => id !== role.id);

      await prisma.guildSettings.update({
        where: { guildId: interaction.guildId },
        data: { [fieldName]: updatedRoles.length > 0 ? updatedRoles : undefined }
      });

      await interaction.reply({ content: `Removed ${role.name} from ${type} roles.`, flags: MessageFlags.Ephemeral });
    } catch (error) {
      console.error(`Error removing ${type} role:`, error);
      await interaction.reply({ content: "Failed to remove role. Please try again.", flags: MessageFlags.Ephemeral });
    }
  }

  @Slash({ name: "status", description: "Show current role mappings for this server." })
  async rolesStatus(interaction: CommandInteraction) {
    if (!interaction.guildId || !interaction.guild) return;

    try {
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId }
      });

      if (!settings) {
        await interaction.reply({
          content: "❌ No settings found for this server. Please set up roles first using the setup commands.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("🔧 Server Role Configuration")
        .setColor(0x0099FF)
        .setDescription("Current role mappings for permission levels:");

      const roleMappings: string[] = [];
      const formatRoles = (roleIds: string[] | null) => {
        if (!roleIds || !Array.isArray(roleIds) || roleIds.length === 0) {
          return "Not configured";
        }
        return roleIds.map(roleId => {
          const role = interaction.guild!.roles.cache.get(roleId);
          return role ? `<@&${role.id}>` : `Role ID: ${roleId}`;
        }).join(', ');
      };

      roleMappings.push(`🔴 **DEV_GUARD** - ${formatRoles(settings.devGuardRoleIds as string[])}`);
      roleMappings.push(`🟥 **STAFF** - ${formatRoles(settings.staffRoleIds as string[])}`);
      roleMappings.push(`🟠 **TRAINER** - ${formatRoles(settings.trainerRoleIds as string[])} *(Cannot access Host Attendance commands)*`);
      roleMappings.push(`🟢 **HOST_ATTENDANCE** - ${formatRoles(settings.hostAttendanceRoleIds as string[])} *(Cannot access Trainer commands)*`);
      roleMappings.push(`🔵 **SHIELD_MEMBER** - ${formatRoles(settings.shieldMemberRoleIds as string[])}`);

      embed.addFields({
        name: "Role Mappings",
        value: roleMappings.join('\n') || "No roles configured",
        inline: false
      });

      embed.setFooter({ text: "Use /settings roles add and /settings roles remove to configure roles" });

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
      console.error("Error fetching role settings:", error);
      await interaction.reply({
        content: "❌ Failed to fetch role settings. Please try again.",
        flags: MessageFlags.Ephemeral
      });
    }
  }
}

// Helper function to map type to field name
function getFieldName(type: string): string {
  switch (type) {
    case "dev-guard": return "devGuardRoleIds";
    case "staff": return "staffRoleIds";
    case "trainer": return "trainerRoleIds";
    case "host-attendance": return "hostAttendanceRoleIds";
    case "shield-member": return "shieldMemberRoleIds";
    default: throw new Error(`Unknown type: ${type}`);
  }
}
