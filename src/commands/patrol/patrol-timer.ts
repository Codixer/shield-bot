import {
  Discord,
  Slash,
  SlashGroup,
  SlashOption,
  SlashChoice,
  Guard,
} from "discordx";
import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  ChannelType,
  CommandInteraction,
  GuildMember,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  Role,
  User,
  AutocompleteInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { patrolTimer } from "../../main.js";
import { StaffGuard } from "../../utility/guards.js";
import {
  userHasPermissionFromRoles,
  PermissionLevel,
} from "../../utility/permissionUtils.js";
import { prisma } from "../../main.js";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

@Discord()
@SlashGroup({
  name: "patrol",
  description: "Voice patrol timer",
  contexts: [InteractionContextType.Guild],
  integrationTypes: [ApplicationIntegrationType.GuildInstall],
})
@SlashGroup("patrol")
export class PatrolTimerCommands {
  @Slash({
    name: "current",
    description: "Show currently tracked users in memory.",
  })
  @Guard(StaffGuard)
  async current(
    @SlashOption({
      name: "ephemeral",
      description: "Whether the response should be ephemeral",
      type: ApplicationCommandOptionType.Boolean,
      required: false,
    })
    ephemeral: boolean = true,
    interaction: CommandInteraction,
  ) {
    if (!interaction.guildId || !interaction.guild) return;
    const list = await patrolTimer.getCurrentTrackedList(interaction.guildId);
    
    if (list.length === 0) {
      await interaction.reply({
        content: "No users currently tracked.",
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
      });
      return;
    }
    const lines = list.map(
      (it) => `• <@${it.userId}> — ${msToReadable(it.ms)} — <#${it.channelId}>`,
    );
    await interaction.reply({
      content: lines.join("\n"),
      flags: ephemeral ? MessageFlags.Ephemeral : undefined,
    });
  }

  @Slash({ name: "top", description: "Show top users by total voice time." })
  @Guard(StaffGuard)
  async top(
    @SlashOption({
      name: "limit",
      description: "Limit",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    @SlashChoice({ name: "10", value: "10" })
    @SlashChoice({ name: "25", value: "25" })
    @SlashChoice({ name: "50", value: "50" })
    @SlashChoice({ name: "100", value: "100" })
    @SlashChoice({ name: "500", value: "500" })
    @SlashChoice({ name: "1000", value: "1000" })
    limit: string | undefined,
    @SlashOption({
      name: "year",
      description: "Year",
      type: ApplicationCommandOptionType.String,
      required: false,
      autocomplete: function (
        this: PatrolTimerCommands,
        interaction: AutocompleteInteraction,
      ) {
        return this.autocompleteYear(interaction);
      },
    })
    year: string | undefined,
    @SlashOption({
      name: "month",
      description: "Month",
      type: ApplicationCommandOptionType.String,
      required: false,
      autocomplete: function (
        this: PatrolTimerCommands,
        interaction: AutocompleteInteraction,
      ) {
        return this.autocompleteMonth(interaction);
      },
    })
    month: string | undefined,
    @SlashOption({
      name: "here",
      description: "Top for your current voice channel",
      type: ApplicationCommandOptionType.Boolean,
      required: false,
    })
    here: boolean | undefined,
    @SlashOption({
      name: "ephemeral",
      description: "Whether the response should be ephemeral",
      type: ApplicationCommandOptionType.Boolean,
      required: false,
    })
    ephemeral: boolean = true,
    interaction: CommandInteraction,
  ) {
    if (!interaction.guildId) return;
    const member = interaction.member as GuildMember;
    const now = new Date();
    let rows: any[];
    if (here) {
      const channelId = member.voice?.channelId;
      if (!channelId) {
        await interaction.reply({
          content: "Join a voice channel first.",
          flags: ephemeral ? MessageFlags.Ephemeral : undefined,
        });
        return;
      }
      rows = await patrolTimer.getTopForChannel(interaction.guild!, channelId);
    } else {
      const y = year ? parseInt(year) : now.getUTCFullYear();
      const m = month ? parseInt(month) : now.getUTCMonth() + 1;
      rows = await (patrolTimer as any).getTopByMonth(
        interaction.guildId,
        y,
        m,
        limit ? parseInt(limit) : undefined,
      );
    }
    if (rows.length === 0) {
      await interaction.reply({
        content: "No data.",
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
      });
      return;
    }
    const lines = rows.map(
      (r: any, idx: number) =>
        `${idx + 1}. <@${r.userId}> — ${msToReadable(Number(r.totalMs))}`,
    );
    await interaction.reply({
      content: lines.join("\n"),
      flags: ephemeral ? MessageFlags.Ephemeral : undefined,
    });
  }

  @Slash({
    name: "wipe",
    description: "Wipe patrol data for a specific user (admin).",
  })
  @Guard(StaffGuard)
  async wipe(
    @SlashOption({
      name: "user",
      description: "User to wipe patrol data for",
      type: ApplicationCommandOptionType.User,
      required: true,
    })
    user: User,
    @SlashOption({
      name: "ephemeral",
      description: "Whether the response should be ephemeral",
      type: ApplicationCommandOptionType.Boolean,
      required: false,
    })
    ephemeral: boolean = true,
    interaction: CommandInteraction,
  ) {
    if (!interaction.guildId) return;
    const member = interaction.member as GuildMember;

    // Create confirmation buttons
    const confirmButton = new ButtonBuilder()
      .setCustomId(`patrol-wipe-confirm:${user.id}:${ephemeral}`)
      .setLabel("Confirm Wipe")
      .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder()
      .setCustomId(`patrol-wipe-cancel:${user.id}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      confirmButton,
      cancelButton,
    );

    await interaction.reply({
      content: `⚠️ **Warning**: This will permanently delete all patrol data for <@${user.id}>. This action cannot be undone.\n\nAre you sure you want to proceed?`,
      components: [row],
      flags: ephemeral ? MessageFlags.Ephemeral : undefined,
    });
  }

  @Slash({
    name: "time",
    description: "Check patrol time (SHIELD_MEMBER can check own time, staff can check others)",
  })
  async time(
    @SlashOption({
      name: "user",
      description: "User to check (staff only, defaults to you)",
      type: ApplicationCommandOptionType.User,
      required: false,
    })
    user: User | undefined,
    @SlashOption({
      name: "all-time",
      description: "Show all-time total instead of current month",
      type: ApplicationCommandOptionType.Boolean,
      required: false,
    })
    allTime: boolean = false,
    @SlashOption({
      name: "year",
      description: "Year (only used if all-time is false)",
      type: ApplicationCommandOptionType.String,
      required: false,
      autocomplete: function (
        this: PatrolTimerCommands,
        interaction: AutocompleteInteraction,
      ) {
        return this.autocompleteYear(interaction);
      },
    })
    year: string | undefined,
    @SlashOption({
      name: "month",
      description: "Month (only used if all-time is false)",
      type: ApplicationCommandOptionType.String,
      required: false,
      autocomplete: function (
        this: PatrolTimerCommands,
        interaction: AutocompleteInteraction,
      ) {
        return this.autocompleteMonth(interaction);
      },
    })
    month: string | undefined,
    interaction: CommandInteraction,
  ) {
    if (!interaction.guildId) return;
    const member = interaction.member as GuildMember;

    // Determine target user
    let targetUserId = user?.id;
    if (!targetUserId) {
      targetUserId = member.id;
    }

    // Permission check: if checking someone else's time, must be staff or higher
    const isCheckingOwnTime = targetUserId === member.id;
    if (!isCheckingOwnTime) {
      // Check if user has staff permissions to view others' time
      if (
        !(await userHasPermissionFromRoles(member, PermissionLevel.STAFF))
      ) {
        await interaction.reply({
          content: "You can only check your own patrol time. Staff members can check others' time.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    } else {
      // Check if user has SHIELD_MEMBER permission to view their own time
      if (
        !(await userHasPermissionFromRoles(member, PermissionLevel.SHIELD_MEMBER))
      ) {
        await interaction.reply({
          content: "You need SHIELD_MEMBER role or higher to check patrol time.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    let total: number;
    let timeDescription: string;

    if (allTime) {
      // Get all-time total
      total = await patrolTimer.getUserTotal(interaction.guildId, targetUserId);
      timeDescription = "all-time";
    } else {
      // Get time for specific month/year (similar to existing user command)
      const now = new Date();
      const y = year ? parseInt(year) : now.getUTCFullYear();
      const m = month ? parseInt(month) : now.getUTCMonth() + 1;

      if (month && !(m >= 1 && m <= 12)) {
        await interaction.reply({
          content: "Invalid month.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      total = await (patrolTimer as any).getUserTotalForMonth(
        interaction.guildId,
        targetUserId,
        y,
        m,
      );
      timeDescription = `${y}, ${MONTH_NAMES[m - 1]}`;
    }

    await interaction.reply({
      content: `<@${targetUserId}> — ${msToReadable(total)} ${timeDescription}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Autocomplete handlers
  async autocompleteYear(interaction: AutocompleteInteraction) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const member = interaction.member as GuildMember;
    if (!member) {
      await interaction.respond([]);
      return;
    }

    // Check if user is staff - if not, only show their own data
    const isStaff = await userHasPermissionFromRoles(member, PermissionLevel.STAFF);

    let years: any[];

    if (isStaff) {
      // Staff can see all years
      years = await (patrolTimer as any).getAvailableYears(interaction.guildId);
    } else {
      // Non-staff can only see years where they have data
      const userRecords = await prisma.voicePatrolMonthlyTime.findMany({
        where: {
          guildId: interaction.guildId,
          userId: member.id,
        },
        select: {
          year: true,
          totalMs: true,
        },
      });

      // Group by year and calculate totals
      const yearMap = new Map<number, { totalMs: bigint }>();
      for (const record of userRecords) {
        if (!yearMap.has(record.year)) {
          yearMap.set(record.year, { totalMs: BigInt(0) });
        }
        yearMap.get(record.year)!.totalMs += record.totalMs;
      }

      // Convert to the expected format
      years = Array.from(yearMap.entries())
        .map(([year, data]) => ({
          year,
          userCount: 1, // Always 1 for personal data
          totalHours: Math.floor(Number(data.totalMs) / 1000 / 60 / 60),
        }))
        .sort((a, b) => b.year - a.year);
    }

    const choices = years.map((y: any) => ({
      name: isStaff 
        ? `${y.year} — ${y.userCount} users, ${y.totalHours}h`
        : `${y.year} — ${y.totalHours}h (your time)`,
      value: y.year.toString(),
    }));

    await interaction.respond(choices.slice(0, 25));
  }

  async autocompleteMonth(interaction: AutocompleteInteraction) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const member = interaction.member as GuildMember;
    if (!member) {
      await interaction.respond([]);
      return;
    }

    // Get the focused option and the year if provided
    const focusedOption = interaction.options.getFocused(true);
    const yearOption = interaction.options.get("year");
    const year = yearOption?.value ? parseInt(yearOption.value as string) : undefined;

    // Check if user is staff - if not, only show their own data
    const isStaff = await userHasPermissionFromRoles(member, PermissionLevel.STAFF);

    let months: any[];

    if (isStaff) {
      // Staff can see all months
      months = await (patrolTimer as any).getAvailableMonths(
        interaction.guildId,
        year,
      );
    } else {
      // Non-staff can only see months where they have data
      const where: any = {
        guildId: interaction.guildId,
        userId: member.id,
      };
      if (year !== undefined) {
        where.year = year;
      }

      const userRecords = await prisma.voicePatrolMonthlyTime.findMany({
        where,
        select: {
          year: true,
          month: true,
          totalMs: true,
        },
      });

      // Group by year+month and calculate totals
      const monthMap = new Map<string, { year: number; month: number; totalMs: bigint }>();
      for (const record of userRecords) {
        const key = `${record.year}-${record.month}`;
        if (!monthMap.has(key)) {
          monthMap.set(key, {
            year: record.year,
            month: record.month,
            totalMs: BigInt(0),
          });
        }
        monthMap.get(key)!.totalMs += record.totalMs;
      }

      // Convert to the expected format
      months = Array.from(monthMap.values())
        .map((data) => ({
          year: data.year,
          month: data.month,
          userCount: 1, // Always 1 for personal data
          totalHours: Math.floor(Number(data.totalMs) / 1000 / 60 / 60),
        }))
        .sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return b.month - a.month;
        });
    }

    const choices = months.map((m: any) => ({
      name: isStaff
        ? `${MONTH_NAMES[m.month - 1]} ${m.year} — ${m.userCount} users, ${m.totalHours}h`
        : `${MONTH_NAMES[m.month - 1]} ${m.year} — ${m.totalHours}h (your time)`,
      value: m.month.toString(),
    }));

    await interaction.respond(choices.slice(0, 25));
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
