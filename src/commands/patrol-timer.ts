import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import { ApplicationCommandOptionType, ChannelType, CommandInteraction, GuildMember, MessageFlags, PermissionFlagsBits } from "discord.js";
import { patrolTimer, prisma } from "../main.js";

@Discord()
@SlashGroup({ name: "patrol", description: "Voice patrol timer" })
@SlashGroup("patrol")
export class PatrolTimerCommands {
  @Slash({ name: "setup-role", description: "Set role allowed to use patrol commands." })
  async setupRole(
    @SlashOption({ name: "role", description: "Discord role (ID or mention)", type: ApplicationCommandOptionType.String, required: true }) roleId: string,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId || !interaction.guild) return;
    const member = interaction.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
      return;
    }
    const id = parseRoleId(roleId);
    if (!id) {
      await interaction.reply({ content: "Provide a role ID or mention.", flags: MessageFlags.Ephemeral });
      return;
    }
    await patrolTimer.setBotuserRole(interaction.guildId, id);
    await interaction.reply({ content: `Set bot user role ID: ${id}`, flags: MessageFlags.Ephemeral });
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
    @SlashOption({ name: "limit", description: "Limit (1-1000)", type: ApplicationCommandOptionType.Integer, required: false }) limit: number | undefined,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId) return;
    const ok = await hasPatrolPermission(interaction.member as GuildMember, interaction.guildId);
    if (!ok) {
      await interaction.reply({ content: "You don't have permission to use this.", flags: MessageFlags.Ephemeral });
      return;
    }
    const rows = await patrolTimer.getTop(interaction.guildId, limit ?? undefined);
    if (rows.length === 0) {
      await interaction.reply({ content: "No data.", flags: MessageFlags.Ephemeral });
      return;
    }
    const lines = rows.map((r: any, idx: number) => `${idx + 1}. <@${r.userId}> — ${msToReadable(Number(r.totalMs))}`);
    await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
  }

  @Slash({ name: "top-here", description: "Show top users for your current voice channel." })
  async topHere(interaction: CommandInteraction) {
    if (!interaction.guild || !interaction.guildId) return;
    const member = interaction.member as GuildMember;
    const channelId = member.voice?.channelId;
    if (!channelId) {
      await interaction.reply({ content: "Join a voice channel first.", flags: MessageFlags.Ephemeral });
      return;
    }
    const ok = await hasPatrolPermission(member, interaction.guildId);
    if (!ok) {
      await interaction.reply({ content: "You don't have permission to use this.", flags: MessageFlags.Ephemeral });
      return;
    }
    const rows = await patrolTimer.getTopForChannel(interaction.guild, channelId);
    if (rows.length === 0) {
      await interaction.reply({ content: "No data for this channel.", flags: MessageFlags.Ephemeral });
      return;
    }
    const lines = rows.map((r: any, idx: number) => `${idx + 1}. <@${r.userId}> — ${msToReadable(Number(r.totalMs))}`);
    await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
  }

  @Slash({ name: "reset", description: "Reset times (admin)." })
  async reset(
    @SlashOption({ name: "user", description: "User mention or ID (optional)", type: ApplicationCommandOptionType.String, required: false }) user: string | undefined,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId) return;
    const member = interaction.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
      return;
    }
    const userId = parseUserId(user);
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

function parseUserId(input?: string) {
  if (!input) return undefined;
  const mention = input.trim();
  if (mention.startsWith("<@") && mention.endsWith(">")) {
    const id = mention.replace(/<@!?/, "").replace(">", "");
    return id;
  }
  return mention;
}

function parseRoleId(input: string) {
  const t = input.trim();
  if (t.startsWith("<@&") && t.endsWith(">")) {
    return t.slice(3, -1);
  }
  return t;
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
  const settings = await (prisma as any).voicePatrolSettings.findUnique({ where: { guildId } });
  if (!settings?.botuserRoleId) return false;
  return member.roles.cache.has(settings.botuserRoleId);
}
