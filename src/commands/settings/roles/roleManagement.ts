import { Discord, Slash, SlashGroup, SlashOption, SlashChoice } from "discordx";
import { ApplicationCommandOptionType, CommandInteraction, PermissionFlagsBits, Role, MessageFlags } from "discord.js";
import { prisma } from "../../../main.js";

@Discord()
// Only reference existing group path to avoid duplicate option names across classes
@SlashGroup("settings", "roles")
export class RoleSettingsManagementCommands {

  @Slash({ name: "add", description: "Add a role to a permission level" })
  async addRole(
    @SlashChoice("dev-guard", "staff", "trainer", "host-attendance", "shield-member")
    @SlashOption({ name: "type", description: "Permission level type", type: ApplicationCommandOptionType.String, required: true }) type: string,
    @SlashOption({ name: "role", description: "Discord role to add", type: ApplicationCommandOptionType.Role, required: true }) role: Role,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId || !interaction.guild) return;

    const member = interaction.member as any;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
      return;
    }

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

    const member = interaction.member as any;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
      return;
    }

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
