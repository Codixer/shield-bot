import { Discord, Slash, SlashGroup, SlashOption, SlashChoice } from "discordx";
import { ApplicationCommandOptionType, ApplicationIntegrationType, ChannelType, CommandInteraction, GuildMember, InteractionContextType, MessageFlags, PermissionFlagsBits, Role, User } from "discord.js";
import { patrolTimer, prisma } from "../../main.js";


@Discord()
@SlashGroup({
  name: "patrol", description: "Voice patrol timer",
  contexts: [InteractionContextType.Guild],
  integrationTypes: [ApplicationIntegrationType.GuildInstall]
})
@SlashGroup("patrol")

export class PatrolTimerCommands {
  @Slash({ name: "setup-role", description: "Set role allowed to use patrol commands." })
  async setupRole(
    @SlashOption({ name: "role", description: "Discord role", type: ApplicationCommandOptionType.Role, required: true }) role: Role,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId || !interaction.guild) return;
    const member = interaction.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
      return;
    }
    await patrolTimer.setBotuserRole(interaction.guildId, role.id);
    await interaction.reply({ content: `Set bot user role ID: ${role.id}`, flags: MessageFlags.Ephemeral });
  }

  @Slash({ name: "setup-category", description: "Set tracked voice category to your current voice channel's parent." })
  async setupCategory(interaction: CommandInteraction) {
    if (!interaction.guildId || !interaction.guild) return;
    const member = interaction.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
      return;
    }
    const voice = member.voice?.channel;
    if (!voice || voice.type !== ChannelType.GuildVoice || !voice.parentId) {
      await interaction.reply({ content: "Join a voice channel inside the desired category first.", flags: MessageFlags.Ephemeral });
      return;
    }
    await patrolTimer.setCategory(interaction.guildId, voice.parentId);
    await interaction.reply({ content: `Tracked category set to: ${voice.parent?.name ?? voice.parentId}`, flags: MessageFlags.Ephemeral });
  }

  @Slash({ name: "current", description: "Show currently tracked users in memory." })
  async current(interaction: CommandInteraction) {
    if (!interaction.guildId || !interaction.guild) return;
    const ok = await hasPatrolPermission(interaction.member as GuildMember, interaction.guildId);
    if (!ok) {
      await interaction.reply({ content: "You don't have permission to use this.", flags: MessageFlags.Ephemeral });
      return;
    }
    const list = await patrolTimer.getCurrentTrackedList(interaction.guildId);
    if (list.length === 0) {
      await interaction.reply({ content: "No users currently tracked.", flags: MessageFlags.Ephemeral });
      return;
    }
    const lines = list.map(it => `• <@${it.userId}> — ${msToReadable(it.ms)} — <#${it.channelId}>`);
    await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
  }

  @Slash({ name: "top", description: "Show top users by total voice time." })
  async top(
    @SlashOption({ name: "limit", description: "Limit", type: ApplicationCommandOptionType.String, required: false })
    @SlashChoice({ name: "10", value: "10" })
    @SlashChoice({ name: "25", value: "25" })
    @SlashChoice({ name: "50", value: "50" })
    @SlashChoice({ name: "100", value: "100" })
    @SlashChoice({ name: "500", value: "500" })
    @SlashChoice({ name: "1000", value: "1000" })
    limit: string | undefined,
    @SlashOption({ name: "year", description: "Year", type: ApplicationCommandOptionType.String, required: false })
    @SlashChoice({ name: "2024", value: "2024" })
    @SlashChoice({ name: "2025", value: "2025" })
    @SlashChoice({ name: "2026", value: "2026" })
    year: string | undefined,
    @SlashOption({ name: "month", description: "Month", type: ApplicationCommandOptionType.String, required: false })
    @SlashChoice({ name: "January", value: "1" })
    @SlashChoice({ name: "February", value: "2" })
    @SlashChoice({ name: "March", value: "3" })
    @SlashChoice({ name: "April", value: "4" })
    @SlashChoice({ name: "May", value: "5" })
    @SlashChoice({ name: "June", value: "6" })
    @SlashChoice({ name: "July", value: "7" })
    @SlashChoice({ name: "August", value: "8" })
    @SlashChoice({ name: "September", value: "9" })
    @SlashChoice({ name: "October", value: "10" })
    @SlashChoice({ name: "November", value: "11" })
    @SlashChoice({ name: "December", value: "12" })
    month: string | undefined,
    @SlashOption({ name: "here", description: "Top for your current voice channel", type: ApplicationCommandOptionType.Boolean, required: false }) here: boolean | undefined,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId) return;
    const ok = await hasPatrolPermission(interaction.member as GuildMember, interaction.guildId);
    if (!ok) {
      await interaction.reply({ content: "You don't have permission to use this.", flags: MessageFlags.Ephemeral });
      return;
    }
    const member = interaction.member as GuildMember;
    const now = new Date();
    let rows: any[];
    if (here) {
      const channelId = member.voice?.channelId;
      if (!channelId) {
        await interaction.reply({ content: "Join a voice channel first.", flags: MessageFlags.Ephemeral });
        return;
      }
      rows = await patrolTimer.getTopForChannel(interaction.guild!, channelId);
    } else {
      const y = year ? parseInt(year) : now.getUTCFullYear();
      const m = month ? parseInt(month) : (now.getUTCMonth() + 1);
      rows = await (patrolTimer as any).getTopByMonth(interaction.guildId, y, m, limit ? parseInt(limit) : undefined);
    }
    if (rows.length === 0) {
      await interaction.reply({ content: "No data.", flags: MessageFlags.Ephemeral });
      return;
    }
    const lines = rows.map((r: any, idx: number) => `${idx + 1}. <@${r.userId}> — ${msToReadable(Number(r.totalMs))}`);
    await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
  }

  @Slash({ name: "user", description: "Show a user's voice time." })
  async user(
    @SlashOption({ name: "user", description: "User (defaults to you)", type: ApplicationCommandOptionType.User, required: false }) user: User | undefined,
    @SlashOption({ name: "year", description: "Year", type: ApplicationCommandOptionType.String, required: false })
    @SlashChoice({ name: "2025", value: "2025" })
    @SlashChoice({ name: "2026", value: "2026" })
    year: string | undefined,
    @SlashOption({ name: "month", description: "Month", type: ApplicationCommandOptionType.String, required: false })
    @SlashChoice({ name: "January", value: "1" })
    @SlashChoice({ name: "February", value: "2" })
    @SlashChoice({ name: "March", value: "3" })
    @SlashChoice({ name: "April", value: "4" })
    @SlashChoice({ name: "May", value: "5" })
    @SlashChoice({ name: "June", value: "6" })
    @SlashChoice({ name: "July", value: "7" })
    @SlashChoice({ name: "August", value: "8" })
    @SlashChoice({ name: "September", value: "9" })
    @SlashChoice({ name: "October", value: "10" })
    @SlashChoice({ name: "November", value: "11" })
    @SlashChoice({ name: "December", value: "12" })
    month: string | undefined,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId) return;
    const ok = await hasPatrolPermission(interaction.member as GuildMember, interaction.guildId);
    if (!ok) {
      await interaction.reply({ content: "You don't have permission to use this.", flags: MessageFlags.Ephemeral });
      return;
    }
    const now = new Date();
    const y = year ? parseInt(year) : now.getUTCFullYear();
    const m = month ? parseInt(month) : (now.getUTCMonth() + 1);
    if (month && !(m >= 1 && m <= 12)) {
      await interaction.reply({ content: "Invalid month.", flags: MessageFlags.Ephemeral });
      return;
    }
    let userId = user?.id;
    if (!userId) {
      const mbr = interaction.member as GuildMember;
      userId = mbr.id;
    }
    let total: number;
    total = await (patrolTimer as any).getUserTotalForMonth(interaction.guildId, userId, y, m);
    const period = ` for ${y}-${m.toString().padStart(2, "0")}`;
    await interaction.reply({ content: `<@${userId}> — ${msToReadable(total)}${period}.`, flags: MessageFlags.Ephemeral });
  }

  @Slash({ name: "reset", description: "Reset times (admin)." })
  async reset(
    @SlashOption({ name: "user", description: "User (optional)", type: ApplicationCommandOptionType.User, required: false }) user: User | undefined,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId) return;
    const member = interaction.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
      return;
    }
    const userId = user?.id;
    await patrolTimer.reset(interaction.guildId, userId);
    await interaction.reply({ content: userId ? `Reset time for <@${userId}>.` : "Reset all times.", flags: MessageFlags.Ephemeral });
  }

  @Slash({ name: "wipe", description: "Wipe all patrol data for this guild (admin)." })
  async wipe(interaction: CommandInteraction) {
    if (!interaction.guildId) return;
    const member = interaction.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
      return;
    }
    await patrolTimer.wipe(interaction.guildId);
    await interaction.reply({ content: "Wiped all patrol data for this guild.", flags: MessageFlags.Ephemeral });
  }
}

function msToReadable(ms: number) {
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

async function hasPatrolPermission(member: GuildMember, guildId: string) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const settings = await (prisma as any).guildSettings.findUnique({ where: { guildId } });
  const roleId = settings?.patrolBotuserRoleId as string | undefined;
  if (!roleId) return false;
  return member.roles.cache.has(roleId);
}
