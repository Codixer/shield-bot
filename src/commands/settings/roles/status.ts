import { Discord, Slash, SlashGroup } from "discordx";
import { CommandInteraction, MessageFlags, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } from "discord.js";
import { prisma } from "../../../main.js";

// Only reference existing group path to avoid redefining options multiple times
@Discord()
@SlashGroup({
  name: "settings",
  description: "Bot configuration and settings commands",
  contexts: [InteractionContextType.Guild],
  integrationTypes: [ApplicationIntegrationType.GuildInstall]
})
@SlashGroup({
  description: "Role settings",
  name: "roles",
  root: "settings"
})
@SlashGroup("settings", "roles")
export class RoleSettingsStatusCommand {

  @Slash({ name: "status", description: "Show current role mappings for this server." })
  async roles(interaction: CommandInteraction) {
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

      const roleMappings = [];

      // Helper function to format role list
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
