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
} from "discord.js";
import { patrolTimer } from "../../main.js";
import { PatrolPermissionGuard } from "../../utility/guards.js";
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
@Guard(PatrolPermissionGuard)
export class PatrolTimerCommands {
  @Slash({
    name: "current",
    description: "Show currently tracked users in memory.",
  })
  async current(interaction: CommandInteraction) {
    if (!interaction.guildId || !interaction.guild) return;
    const list = await patrolTimer.getCurrentTrackedList(interaction.guildId);
    if (list.length === 0) {
      await interaction.reply({
        content: "No users currently tracked.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const lines = list.map(
      (it) => `• <@${it.userId}> — ${msToReadable(it.ms)} — <#${it.channelId}>`,
    );
    await interaction.reply({
      content: lines.join("\n"),
      flags: MessageFlags.Ephemeral,
    });
  }

  @Slash({ name: "top", description: "Show top users by total voice time." })
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
          flags: MessageFlags.Ephemeral,
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
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const lines = rows.map(
      (r: any, idx: number) =>
        `${idx + 1}. <@${r.userId}> — ${msToReadable(Number(r.totalMs))}`,
    );
    await interaction.reply({
      content: lines.join("\n"),
      flags: MessageFlags.Ephemeral,
    });
  }

  @Slash({ name: "user", description: "Show a user's voice time." })
  async user(
    @SlashOption({
      name: "user",
      description: "User (defaults to you)",
      type: ApplicationCommandOptionType.User,
      required: false,
    })
    user: User | undefined,
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
    interaction: CommandInteraction,
  ) {
    if (!interaction.guildId) return;
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
    let userId = user?.id;
    if (!userId) {
      const mbr = interaction.member as GuildMember;
      userId = mbr.id;
    }
    let total: number;
    total = await (patrolTimer as any).getUserTotalForMonth(
      interaction.guildId,
      userId,
      y,
      m,
    );
    const period = ` for ${y}-${m.toString().padStart(2, "0")}`;
    await interaction.reply({
      content: `<@${userId}> — ${msToReadable(total)}${period}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  @Slash({ name: "reset", description: "Reset times (admin)." })
  async reset(
    @SlashOption({
      name: "user",
      description: "User (optional)",
      type: ApplicationCommandOptionType.User,
      required: false,
    })
    user: User | undefined,
    interaction: CommandInteraction,
  ) {
    if (!interaction.guildId) return;
    const member = interaction.member as GuildMember;

    // Check administrator permission first (bypass)
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      // Check role-based permission level
      if (
        !(await userHasPermissionFromRoles(member, PermissionLevel.DEV_GUARD))
      ) {
        await interaction.reply({
          content: "Admin only.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    const userId = user?.id;
    await patrolTimer.reset(interaction.guildId, userId);
    await interaction.reply({
      content: userId ? `Reset time for <@${userId}>.` : "Reset all times.",
      flags: MessageFlags.Ephemeral,
    });
  }

  @Slash({
    name: "wipe",
    description: "Wipe all patrol data for this guild (admin).",
  })
  async wipe(interaction: CommandInteraction) {
    if (!interaction.guildId) return;
    const member = interaction.member as GuildMember;

    // Check administrator permission first (bypass)
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      // Check role-based permission level
      if (
        !(await userHasPermissionFromRoles(member, PermissionLevel.DEV_GUARD))
      ) {
        await interaction.reply({
          content: "Admin only.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    await patrolTimer.wipe(interaction.guildId);
    await interaction.reply({
      content: "Wiped all patrol data for this guild.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Autocomplete handlers
  async autocompleteYear(interaction: AutocompleteInteraction) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const years = await (patrolTimer as any).getAvailableYears(
      interaction.guildId,
    );

    const choices = years.map((y: any) => ({
      name: `${y.year} — ${y.userCount} users, ${y.totalHours}h`,
      value: y.year.toString(),
    }));

    await interaction.respond(choices.slice(0, 25));
  }

  async autocompleteMonth(interaction: AutocompleteInteraction) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    // Get the focused option and the year if provided
    const focusedOption = interaction.options.getFocused(true);
    const yearOption = interaction.options.get("year");
    const year = yearOption?.value ? parseInt(yearOption.value as string) : undefined;

    const months = await (patrolTimer as any).getAvailableMonths(
      interaction.guildId,
      year,
    );

    const choices = months.map((m: any) => ({
      name: `${MONTH_NAMES[m.month - 1]} ${m.year} — ${m.userCount} users, ${m.totalHours}h`,
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
