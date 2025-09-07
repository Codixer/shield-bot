import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import { ApplicationCommandOptionType, CommandInteraction, PermissionFlagsBits, Role, MessageFlags, InteractionContextType, ApplicationIntegrationType, EmbedBuilder } from "discord.js";
import { prisma, bot } from "../../main.js";
import { PatrolTimerManager } from "../../managers/patrol/patrolTimerManager.js";

// Create a local patrol timer instance
const patrolTimer = new PatrolTimerManager(bot);

@Discord()
@SlashGroup({
  name: "settings",
  description: "Bot configuration and settings commands",
  contexts: [InteractionContextType.Guild],
  integrationTypes: [ApplicationIntegrationType.GuildInstall]
})
@SlashGroup("settings")
export class SettingsCommands {

  // Patrol management subgroup
  @SlashGroup("settings", "patrol")
  @Slash({ name: "setup-category", description: "Set tracked voice category to your current voice channel's parent." })
  async setupPatrolCategory(interaction: CommandInteraction) {
    if (!interaction.guildId || !interaction.guild) return;

    const member = interaction.member as any;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
      return;
    }

    const voice = member.voice?.channel;
    if (!voice || voice.type !== 2 || !voice.parentId) {
      await interaction.reply({ content: "Join a voice channel inside the desired category first.", flags: MessageFlags.Ephemeral });
      return;
    }

    await patrolTimer.setCategory(interaction.guildId, voice.parentId);
    await interaction.reply({ content: `Tracked category set to: ${voice.parent?.name ?? voice.parentId}`, flags: MessageFlags.Ephemeral });
  }

  // Role management subgroup
  @SlashGroup("settings", "roles")
  @Slash({ name: "setup-host-attendance-role", description: "Set role allowed to manage attendance." })
  async setupHostAttendanceRole(
    @SlashOption({ name: "role", description: "Discord role", type: ApplicationCommandOptionType.Role, required: true }) role: Role,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId || !interaction.guild) return;

    const member = interaction.member as any;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
      return;
    }

    await prisma.guildSettings.upsert({
      where: { guildId: interaction.guildId },
      update: { hostAttendanceRoleId: role.id },
      create: { guildId: interaction.guildId, hostAttendanceRoleId: role.id }
    });

    await interaction.reply({ content: `Set host attendance role ID: ${role.id}`, flags: MessageFlags.Ephemeral });
  }

  @SlashGroup("settings", "roles")
  @Slash({ name: "setup-shield-member-role", description: "Set role for shield members." })
  async setupShieldMemberRole(
    @SlashOption({ name: "role", description: "Discord role", type: ApplicationCommandOptionType.Role, required: true }) role: Role,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId || !interaction.guild) return;

    const member = interaction.member as any;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
      return;
    }

    await prisma.guildSettings.upsert({
      where: { guildId: interaction.guildId },
      update: { shieldMemberRoleId: role.id },
      create: { guildId: interaction.guildId, shieldMemberRoleId: role.id }
    });

    await interaction.reply({ content: `Set shield member role ID: ${role.id}`, flags: MessageFlags.Ephemeral });
  }

  @SlashGroup("settings", "roles")
  @Slash({ name: "setup-staff-role", description: "Set role for staff members." })
  async setupStaffRole(
    @SlashOption({ name: "role", description: "Discord role", type: ApplicationCommandOptionType.Role, required: true }) role: Role,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId || !interaction.guild) return;

    const member = interaction.member as any;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
      return;
    }

    await prisma.guildSettings.upsert({
      where: { guildId: interaction.guildId },
      update: { staffRoleId: role.id },
      create: { guildId: interaction.guildId, staffRoleId: role.id }
    });

    await interaction.reply({ content: `Set staff role ID: ${role.id}`, flags: MessageFlags.Ephemeral });
  }

  @SlashGroup("settings", "roles")
  @Slash({ name: "setup-trainer-role", description: "Set role for trainers." })
  async setupTrainerRole(
    @SlashOption({ name: "role", description: "Discord role", type: ApplicationCommandOptionType.Role, required: true }) role: Role,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId || !interaction.guild) return;

    const member = interaction.member as any;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
      return;
    }

    await prisma.guildSettings.upsert({
      where: { guildId: interaction.guildId },
      update: { trainerRoleId: role.id },
      create: { guildId: interaction.guildId, trainerRoleId: role.id }
    });

    await interaction.reply({ content: `Set trainer role ID: ${role.id}`, flags: MessageFlags.Ephemeral });
  }

  @SlashGroup("settings", "roles")
  @Slash({ name: "setup-dev-guard-role", description: "Set role for dev guards." })
  async setupDevGuardRole(
    @SlashOption({ name: "role", description: "Discord role", type: ApplicationCommandOptionType.Role, required: true }) role: Role,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId || !interaction.guild) return;

    const member = interaction.member as any;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
      return;
    }

    await prisma.guildSettings.upsert({
      where: { guildId: interaction.guildId },
      update: { devGuardRoleId: role.id },
      create: { guildId: interaction.guildId, devGuardRoleId: role.id }
    });

    await interaction.reply({ content: `Set dev guard role ID: ${role.id}`, flags: MessageFlags.Ephemeral });
  }

  @SlashGroup("settings", "roles")
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

      if (settings.devGuardRoleId) {
        const role = interaction.guild.roles.cache.get(settings.devGuardRoleId);
        roleMappings.push(`🟠 **DEV_GUARD** - ${role ? `<@&${role.id}>` : `Role ID: ${settings.devGuardRoleId}`}`);
      } else {
        roleMappings.push("🟠 **DEV_GUARD** - Not configured");
      }

      if (settings.staffRoleId) {
        const role = interaction.guild.roles.cache.get(settings.staffRoleId);
        roleMappings.push(`🟡 **STAFF** - ${role ? `<@&${role.id}>` : `Role ID: ${settings.staffRoleId}`}`);
      } else {
        roleMappings.push("🟡 **STAFF** - Not configured");
      }

      if (settings.trainerRoleId) {
        const role = interaction.guild.roles.cache.get(settings.trainerRoleId);
        roleMappings.push(`🟠 **TRAINER** - ${role ? `<@&${role.id}>` : `Role ID: ${settings.trainerRoleId}`} *(Cannot access Host Attendance commands)*`);
      } else {
        roleMappings.push("🟠 **TRAINER** - Not configured");
      }

      if (settings.hostAttendanceRoleId) {
        const role = interaction.guild.roles.cache.get(settings.hostAttendanceRoleId);
        roleMappings.push(`🟢 **HOST_ATTENDANCE** - ${role ? `<@&${role.id}>` : `Role ID: ${settings.hostAttendanceRoleId}`} *(Cannot access Trainer commands)*`);
      } else {
        roleMappings.push("🟢 **HOST_ATTENDANCE** - Not configured");
      }

      if (settings.shieldMemberRoleId) {
        const role = interaction.guild.roles.cache.get(settings.shieldMemberRoleId);
        roleMappings.push(`🔵 **SHIELD_MEMBER** - ${role ? `<@&${role.id}>` : `Role ID: ${settings.shieldMemberRoleId}`}`);
      } else {
        roleMappings.push("🔵 **SHIELD_MEMBER** - Not configured");
      }

      embed.addFields({
        name: "Role Mappings",
        value: roleMappings.join('\n') || "No roles configured",
        inline: false
      });

      embed.setFooter({ text: "Use /settings setup-* commands to configure roles" });

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
