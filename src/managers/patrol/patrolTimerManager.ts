import {
  Client,
  ChannelType,
  Guild,
  GuildMember,
  VoiceChannel,
  VoiceState,
} from "discord.js";
import { prisma } from "../../main.js";

type TrackedUser = {
  userId: string;
  channelId: string;
  startedAt: Date;
};

export class PatrolTimerManager {
  private client: Client;
  // guildId => Map<userId, TrackedUser>
  private tracked: Map<string, Map<string, TrackedUser>> = new Map();
  // guildId => Set<userId> for paused users
  private pausedUsers: Map<string, Set<string>> = new Map();
  // guildId => boolean for guild-wide pause
  private pausedGuilds: Set<string> = new Set();

  constructor(client: Client) {
    this.client = client;
  }

  async init() {
    // Warm tracked maps for all guilds the bot is in
    for (const guild of this.client.guilds.cache.values()) {
      this.tracked.set(guild.id, new Map());
    }

    // Load persisted active sessions
    const activeSessions = await (
      prisma as any
    ).activeVoicePatrolSession.findMany();
    for (const session of activeSessions) {
      if (!this.tracked.has(session.guildId))
        this.tracked.set(session.guildId, new Map());
      const guildMap = this.tracked.get(session.guildId)!;
      guildMap.set(session.userId, {
        userId: session.userId,
        channelId: session.channelId,
        startedAt: session.startedAt,
      });
    }

    // On startup, scan current voice states and resume tracking for members
    // already connected to channels within the configured category.
    for (const guild of this.client.guilds.cache.values()) {
      try {
        await this.resumeActiveForGuild(guild);
      } catch (err) {
        console.error(
          `[PatrolTimer] Failed to resume active sessions for guild ${guild.id}:`,
          err,
        );
      }
    }
  }

  // Settings helpers
  async getSettings(guildId: string) {
    let settings = await (prisma as any).guildSettings.findUnique({
      where: { guildId },
    });
    if (!settings) {
      settings = await (prisma as any).guildSettings.create({
        data: { guildId },
      });
    }
    // One-time backfill from legacy VoicePatrolSettings table if present
    if (!settings.patrolBotuserRoleId || !settings.patrolChannelCategoryId) {
      try {
        const rows = await (prisma as any)
          .$queryRaw`SELECT botuserRoleId, channelCategoryId FROM VoicePatrolSettings WHERE guildId = ${guildId} LIMIT 1`;
        const legacy = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        if (legacy) {
          const patch: any = {};
          if (legacy.botuserRoleId && !settings.patrolBotuserRoleId)
            patch.patrolBotuserRoleId = legacy.botuserRoleId as string;
          if (legacy.channelCategoryId && !settings.patrolChannelCategoryId)
            patch.patrolChannelCategoryId = legacy.channelCategoryId as string;
          if (Object.keys(patch).length > 0) {
            settings = await (prisma as any).guildSettings.update({
              where: { guildId },
              data: patch,
            });
          }
        }
      } catch (_) {
        // ignore if table doesn't exist
      }
    }
    return settings as {
      guildId: string;
      patrolBotuserRoleId?: string | null;
      patrolChannelCategoryId?: string | null;
    };
  }

  async setBotuserRole(guildId: string, roleId: string | null) {
    await this.getSettings(guildId); // ensure row
    await (prisma as any).guildSettings.update({
      where: { guildId },
      data: { patrolBotuserRoleId: roleId ?? null },
    });
  }

  async setCategory(guildId: string, categoryId: string | null) {
    await this.getSettings(guildId); // ensure row
    await (prisma as any).guildSettings.update({
      where: { guildId },
      data: { patrolChannelCategoryId: categoryId ?? null },
    });
  }

  // Core tracking

  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
    try {
      const guild = newState.guild || oldState.guild;
      if (!guild) return;
      const guildId = guild.id;
      const member = newState.member || oldState.member;
      if (!member || member.user.bot) return;
      const settings = await this.getSettings(guildId);
      if (!settings.patrolChannelCategoryId) return; // not configured

      const leftChannelId = oldState.channelId;
      const joinedChannelId = newState.channelId;

      // Ensure map
      if (!this.tracked.has(guildId)) this.tracked.set(guildId, new Map());
      const guildMap = this.tracked.get(guildId)!;

      // Helper to check if a channel is in tracked category
      const isInTrackedCategory = (cid: string | null | undefined) => {
        if (!cid) return false;
        const ch = guild.channels.cache.get(cid);
        if (!ch || ch.type !== ChannelType.GuildVoice) return false;
        return (
          (ch as VoiceChannel).parentId === settings.patrolChannelCategoryId
        );
      };

      const wasTracked = isInTrackedCategory(leftChannelId);
      const nowTracked = isInTrackedCategory(joinedChannelId);

      // If leaving a tracked channel, stop and persist
      if (wasTracked && (!nowTracked || leftChannelId !== joinedChannelId)) {
        await this.stopTrackingAndPersist(guildId, member);
      }

      // If joining a tracked channel, start tracking
      if (nowTracked && (!wasTracked || leftChannelId !== joinedChannelId)) {
        this.startTracking(guildId, member, joinedChannelId!);
      }
    } catch (err) {
      console.error("[PatrolTimer] voiceStateUpdate error:", err);
    }
  }

  private startTracking(
    guildId: string,
    member: GuildMember,
    channelId: string,
  ) {
    if (member.user.bot) return;
    if (!this.tracked.has(guildId)) this.tracked.set(guildId, new Map());
    const guildMap = this.tracked.get(guildId)!;
    // Avoid clobbering an existing tracking session (e.g., during startup scan)
    if (guildMap.has(member.id)) return;
    const startedAt = new Date();
    guildMap.set(member.id, { userId: member.id, channelId, startedAt });
    // Persist to DB
    (prisma as any).activeVoicePatrolSession
      .upsert({
        where: { guildId_userId: { guildId, userId: member.id } },
        update: { channelId, startedAt },
        create: { guildId, userId: member.id, channelId, startedAt },
      })
      .catch((err: any) =>
        console.error("[PatrolTimer] Failed to persist session:", err),
      );
    // console.log(`[PatrolTimer] Start ${member.user.tag} in ${channelId}`);
  }

  private async stopTrackingAndPersist(guildId: string, member: GuildMember) {
    const guildMap = this.tracked.get(guildId);
    if (!guildMap) return;
    const tracked = guildMap.get(member.id);
    if (!tracked) return;
    
    guildMap.delete(member.id);
    
    // Don't persist time if user is paused
    if (this.isUserPaused(guildId, member.id)) {
      // Delete persisted session
      await (prisma as any).activeVoicePatrolSession
        .deleteMany({
          where: { guildId, userId: member.id },
        })
        .catch((err: any) =>
          console.error("[PatrolTimer] Failed to delete session:", err),
        );
      return;
    }
    
    // If switching channels within same category, we still finalize from old channel
    const nowMs = Date.now();
    const delta = nowMs - tracked.startedAt.getTime();
    if (delta < 3000) return; // ignore very short joins; parity with original impl
    // Delete persisted session
    await (prisma as any).activeVoicePatrolSession
      .deleteMany({
        where: { guildId, userId: member.id },
      })
      .catch((err: any) =>
        console.error("[PatrolTimer] Failed to delete session:", err),
      );
    // Ensure a corresponding User row exists for this Discord ID
    await this.ensureUser(member.id);
    // Upsert DB row and increment time
    await (prisma as any).voicePatrolTime.upsert({
      where: { guildId_userId: { guildId, userId: member.id } },
      update: { totalMs: { increment: BigInt(delta) } },
      create: { guildId, userId: member.id, totalMs: BigInt(delta) },
    });

    // Also persist monthly totals, splitting across month boundaries (UTC)
    await this.persistMonthly(
      guildId,
      member.id,
      tracked.startedAt,
      new Date(nowMs),
    );
  }

  /** Scan the guild's voice channels within the tracked category and resume tracking for present members. */
  private async resumeActiveForGuild(guild: Guild): Promise<void> {
    const settings = await this.getSettings(guild.id);
    if (!settings.patrolChannelCategoryId) return;

    // Find all voice channels under the tracked category
    const voiceChannels = guild.channels.cache.filter(
      (c): c is VoiceChannel =>
        c?.type === ChannelType.GuildVoice &&
        (c as VoiceChannel).parentId === settings.patrolChannelCategoryId,
    );

    if (!voiceChannels.size) return;

    const trackedUsers = new Set<string>();

    for (const ch of voiceChannels.values()) {
      // ch.members contains members currently connected to this voice channel
      for (const member of ch.members.values()) {
        if (member.user.bot) continue;
        trackedUsers.add(member.id);
        this.startTracking(guild.id, member, ch.id);
      }
    }

    // Stop tracking for users who have persisted sessions but are no longer in a tracked channel
    const guildMap = this.tracked.get(guild.id);
    if (guildMap) {
      for (const [userId, tracked] of guildMap.entries()) {
        if (!trackedUsers.has(userId)) {
          // User left while bot was down, stop and persist
          const member = guild.members.cache.get(userId);
          if (member) {
            await this.stopTrackingAndPersist(guild.id, member);
          } else {
            // Member not in cache, perhaps left guild, just delete session
            guildMap.delete(userId);
            await (prisma as any).activeVoicePatrolSession
              .deleteMany({
                where: { guildId: guild.id, userId },
              })
              .catch((err: any) =>
                console.error("[PatrolTimer] Failed to delete session:", err),
              );
          }
        }
      }
    }
  }

  // Commands
  async getCurrentTrackedList(guildId: string) {
    const guildMap = this.tracked.get(guildId);
    if (!guildMap)
      return [] as Array<{ userId: string; ms: number; channelId: string }>;
    const now = Date.now();
    const arr: Array<{ userId: string; ms: number; channelId: string }> = [];
    for (const tu of guildMap.values()) {
      // Show 0ms if paused
      const ms = this.isUserPaused(guildId, tu.userId) 
        ? 0 
        : now - tu.startedAt.getTime();
      arr.push({
        userId: tu.userId,
        channelId: tu.channelId,
        ms,
      });
    }
    return arr;
  }

  async getTop(guildId: string, limit?: number) {
    const rows = await (prisma as any).voicePatrolTime.findMany({
      where: { guildId },
      orderBy: { totalMs: "desc" },
      take: undefined, // we'll sort after adding live deltas
    });

    // Merge live tracked deltas
    const now = Date.now();
    const guildMap = this.tracked.get(guildId);
    const byUser: Record<string, number> = {};

    for (const r of rows) {
      byUser[r.userId] = Number(r.totalMs);
    }
    if (guildMap) {
      for (const tu of guildMap.values()) {
        // Only add delta if user is not paused
        if (!this.isUserPaused(guildId, tu.userId)) {
          const delta = now - tu.startedAt.getTime();
          if (delta > 0) byUser[tu.userId] = (byUser[tu.userId] ?? 0) + delta;
        }
      }
    }

    // To array and sort desc
    const arr = Object.entries(byUser)
      .map(([userId, totalMs]) => ({ userId, totalMs }))
      .sort((a, b) => b.totalMs - a.totalMs);

    const limited =
      limit && limit > 0 ? arr.slice(0, Math.min(limit, 1000)) : arr;

    // Return in a shape similar to prisma rows expected by command code
    return limited.map((r) => ({
      userId: r.userId,
      totalMs: BigInt(Math.max(0, Math.floor(r.totalMs))),
    }));
  }

  async getTopByMonth(
    guildId: string,
    year: number,
    month: number,
    limit?: number,
  ) {
    const rows = await (prisma as any).voicePatrolMonthlyTime.findMany({
      where: { guildId, year, month },
      orderBy: { totalMs: "desc" },
      take: undefined,
    });
    // Merge live delta if querying the current UTC month
    const now = new Date();
    const isCurrentMonth =
      now.getUTCFullYear() === year && now.getUTCMonth() + 1 === month;
    if (!isCurrentMonth) {
      const limited =
        limit && limit > 0 ? rows.slice(0, Math.min(limit, 1000)) : rows;
      return limited;
    }

    const monthStart = new Date(
      Date.UTC(year, month - 1, 1, 0, 0, 0, 0),
    ).getTime();
    const nowMs = now.getTime();
    const guildMap = this.tracked.get(guildId);
    const byUser: Record<string, number> = {};

    for (const r of rows) byUser[r.userId] = Number(r.totalMs);

    if (guildMap) {
      for (const tu of guildMap.values()) {
        // Only add delta if user is not paused
        if (!this.isUserPaused(guildId, tu.userId)) {
          const startMs = Math.max(tu.startedAt.getTime(), monthStart);
          const delta = Math.max(0, nowMs - startMs);
          if (delta > 0) byUser[tu.userId] = (byUser[tu.userId] ?? 0) + delta;
        }
      }
    }

    const arr = Object.entries(byUser)
      .map(([userId, totalMs]) => ({ userId, totalMs }))
      .sort((a, b) => b.totalMs - a.totalMs);
    const limited =
      limit && limit > 0 ? arr.slice(0, Math.min(limit, 1000)) : arr;
    return limited.map((r) => ({
      userId: r.userId,
      totalMs: BigInt(Math.max(0, Math.floor(r.totalMs))),
    }));
  }

  async getUserTotalForMonth(
    guildId: string,
    userId: string,
    year: number,
    month: number,
  ) {
    const row = await (prisma as any).voicePatrolMonthlyTime.findUnique({
      where: { guildId_userId_year_month: { guildId, userId, year, month } },
    });
    let base = row?.totalMs ? Number(row.totalMs) : 0;

    // Add live delta for current month if user is currently tracked and not paused
    const now = new Date();
    const isCurrentMonth =
      now.getUTCFullYear() === year && now.getUTCMonth() + 1 === month;
    if (isCurrentMonth && !this.isUserPaused(guildId, userId)) {
      const guildMap = this.tracked.get(guildId);
      const tu = guildMap?.get(userId);
      if (tu) {
        const monthStart = new Date(
          Date.UTC(year, month - 1, 1, 0, 0, 0, 0),
        ).getTime();
        const startMs = Math.max(tu.startedAt.getTime(), monthStart);
        const delta = Math.max(0, Date.now() - startMs);
        base += delta;
      }
    }
    return base;
  }

  async getTopForChannel(guild: Guild, channelId: string) {
    // Get members in this voice channel
    const members = guild.members.cache.filter(
      (m) => !m.user.bot && m.voice?.channelId === channelId,
    );
    const ids = members.map((m) => m.id);
    if (ids.length === 0) return [] as any[];
    const rows = await (prisma as any).voicePatrolTime.findMany({
      where: { guildId: guild.id, userId: { in: ids } },
      orderBy: { totalMs: "desc" },
    });

    const now = Date.now();
    const guildMap = this.tracked.get(guild.id);
    const byUser: Record<string, number> = {};

    for (const r of rows) {
      byUser[r.userId] = Number(r.totalMs);
    }
    if (guildMap) {
      for (const tu of guildMap.values()) {
        if (tu.channelId !== channelId) continue; // only add deltas for this channel
        if (!ids.includes(tu.userId)) continue;
        // Only add delta if user is not paused
        if (!this.isUserPaused(guild.id, tu.userId)) {
          const delta = now - tu.startedAt.getTime();
          if (delta > 0) byUser[tu.userId] = (byUser[tu.userId] ?? 0) + delta;
        }
      }
    }

    const arr = Object.entries(byUser)
      .map(([userId, totalMs]) => ({ userId, totalMs }))
      .sort((a, b) => b.totalMs - a.totalMs);

    return arr.map((r) => ({
      userId: r.userId,
      totalMs: BigInt(Math.max(0, Math.floor(r.totalMs))),
    }));
  }

  async reset(guildId: string, userId?: string) {
    if (userId) {
      // Clear database records
      await (prisma as any).voicePatrolTime.updateMany({
        where: { guildId, userId },
        data: { totalMs: BigInt(0) },
      });
      await (prisma as any).activeVoicePatrolSession.deleteMany({
        where: { guildId, userId },
      });
      
      // Clear in-memory tracking for this specific user
      const guildMap = this.tracked.get(guildId);
      if (guildMap) {
        const tracked = guildMap.get(userId);
        if (tracked) {
          // Reset their start time to now instead of deleting,
          // so they continue being tracked if still in channel
          tracked.startedAt = new Date();
        }
      }
    } else {
      // Clear database records for all users
      await (prisma as any).voicePatrolTime.updateMany({
        where: { guildId },
        data: { totalMs: BigInt(0) },
      });
      await (prisma as any).activeVoicePatrolSession.deleteMany({
        where: { guildId },
      });
      
      // Clear in-memory tracking for all users in this guild
      const guildMap = this.tracked.get(guildId);
      if (guildMap) {
        const now = new Date();
        for (const tracked of guildMap.values()) {
          // Reset their start time to now instead of deleting,
          // so they continue being tracked if still in channel
          tracked.startedAt = now;
        }
      }
    }
  }

  async getUserTotal(guildId: string, userId: string) {
    const row = await (prisma as any).voicePatrolTime.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    let base = row?.totalMs ? Number(row.totalMs) : 0;
    // Add live delta if user is not paused
    if (!this.isUserPaused(guildId, userId)) {
      const guildMap = this.tracked.get(guildId);
      const tu = guildMap?.get(userId);
      if (tu) {
        const delta = Date.now() - tu.startedAt.getTime();
        base += delta;
      }
    }
    return base;
  }

  /**
   * Pause time tracking for a specific user.
   * Persists their current time and prevents further accumulation.
   * Returns true if successful, false if user has active timer.
   */
  async pauseUser(guildId: string, userId: string): Promise<boolean> {
    // Check if user is currently tracked (active timer)
    const guildMap = this.tracked.get(guildId);
    const tracked = guildMap?.get(userId);
    if (tracked) {
      return false; // Cannot pause while user has active timer
    }

    // Add to paused set
    if (!this.pausedUsers.has(guildId)) {
      this.pausedUsers.set(guildId, new Set());
    }
    this.pausedUsers.get(guildId)!.add(userId);
    
    return true;
  }

  /**
   * Unpause time tracking for a specific user.
   */
  async unpauseUser(guildId: string, userId: string) {
    const paused = this.pausedUsers.get(guildId);
    if (paused) {
      paused.delete(userId);
    }

    // Reset their start time if they're currently tracked
    const guildMap = this.tracked.get(guildId);
    const tracked = guildMap?.get(userId);
    if (tracked) {
      tracked.startedAt = new Date();
    }
  }

  /**
   * Pause time tracking for all users in the guild.
   * Returns true if successful, false if any users have active timers.
   */
  async pauseGuild(guildId: string): Promise<boolean> {
    // Check if any users are currently tracked (have active timers)
    const guildMap = this.tracked.get(guildId);
    if (guildMap && guildMap.size > 0) {
      return false; // Cannot pause guild while users have active timers
    }

    this.pausedGuilds.add(guildId);
    return true;
  }

  /**
   * Unpause time tracking for all users in the guild.
   */
  async unpauseGuild(guildId: string) {
    this.pausedGuilds.delete(guildId);

    // Reset start times for all currently tracked users
    const guildMap = this.tracked.get(guildId);
    if (guildMap) {
      const now = new Date();
      for (const tracked of guildMap.values()) {
        tracked.startedAt = now;
      }
    }
  }

  /**
   * Check if a user is paused (either individually or guild-wide).
   */
  isUserPaused(guildId: string, userId: string): boolean {
    if (this.pausedGuilds.has(guildId)) return true;
    const paused = this.pausedUsers.get(guildId);
    return paused ? paused.has(userId) : false;
  }

  /**
   * Check if the entire guild is paused.
   */
  isGuildPaused(guildId: string): boolean {
    return this.pausedGuilds.has(guildId);
  }

  /**
   * Adjust time for a specific user (add or subtract milliseconds).
   * @param guildId - Guild ID
   * @param userId - User ID
   * @param deltaMs - Milliseconds to add (positive) or subtract (negative)
   * @param year - Year to adjust (defaults to current year)
   * @param month - Month to adjust (defaults to current month)
   */
  async adjustUserTime(guildId: string, userId: string, deltaMs: number, year?: number, month?: number) {
    await this.ensureUser(userId);
    
    // Determine target year and month
    const now = new Date();
    const targetYear = year ?? now.getUTCFullYear();
    const targetMonth = month ?? (now.getUTCMonth() + 1);
    
    // Update all-time total
    const row = await (prisma as any).voicePatrolTime.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    
    const currentTotal = row?.totalMs ? Number(row.totalMs) : 0;
    const newTotal = Math.max(0, currentTotal + deltaMs); // Don't go below 0
    
    await (prisma as any).voicePatrolTime.upsert({
      where: { guildId_userId: { guildId, userId } },
      update: { totalMs: BigInt(newTotal) },
      create: { guildId, userId, totalMs: BigInt(newTotal) },
    });

    // Also adjust specified month's total
    const monthRow = await (prisma as any).voicePatrolMonthlyTime.findUnique({
      where: { guildId_userId_year_month: { guildId, userId, year: targetYear, month: targetMonth } },
    });
    
    const currentMonthTotal = monthRow?.totalMs ? Number(monthRow.totalMs) : 0;
    const newMonthTotal = Math.max(0, currentMonthTotal + deltaMs);
    
    await (prisma as any).voicePatrolMonthlyTime.upsert({
      where: { guildId_userId_year_month: { guildId, userId, year: targetYear, month: targetMonth } },
      update: { totalMs: BigInt(newMonthTotal) },
      create: { guildId, userId, year: targetYear, month: targetMonth, totalMs: BigInt(newMonthTotal) },
    });
  }

  /**
   * Get all years that have patrol data for this guild.
   * Returns array of objects with year, user count, and total hours.
   */
  async getAvailableYears(guildId: string): Promise<
    Array<{
      year: number;
      userCount: number;
      totalHours: number;
    }>
  > {
    // Get all records for this guild
    const records = await (prisma as any).voicePatrolMonthlyTime.findMany({
      where: { guildId },
      select: {
        year: true,
        userId: true,
        totalMs: true,
      },
    });

    // Group by year and aggregate
    const yearMap = new Map<
      number,
      { userIds: Set<string>; totalMs: bigint }
    >();

    for (const record of records) {
      if (!yearMap.has(record.year)) {
        yearMap.set(record.year, {
          userIds: new Set(),
          totalMs: BigInt(0),
        });
      }
      const yearData = yearMap.get(record.year)!;
      yearData.userIds.add(record.userId);
      yearData.totalMs += record.totalMs;
    }

    // Convert to array and sort by year descending
    return Array.from(yearMap.entries())
      .map(([year, data]) => ({
        year,
        userCount: data.userIds.size,
        totalHours: Math.floor(Number(data.totalMs) / 1000 / 60 / 60),
      }))
      .sort((a, b) => b.year - a.year);
  }

  /**
   * Get all months that have patrol data for this guild (optionally filtered by year).
   * Returns array of objects with year, month, user count, and total hours.
   */
  async getAvailableMonths(
    guildId: string,
    year?: number,
  ): Promise<
    Array<{
      year: number;
      month: number;
      userCount: number;
      totalHours: number;
    }>
  > {
    const where: any = { guildId };
    if (year !== undefined) {
      where.year = year;
    }

    const records = await (prisma as any).voicePatrolMonthlyTime.findMany({
      where,
      select: {
        year: true,
        month: true,
        userId: true,
        totalMs: true,
      },
    });

    // Group by year+month and aggregate
    const monthMap = new Map<
      string,
      { year: number; month: number; userIds: Set<string>; totalMs: bigint }
    >();

    for (const record of records) {
      const key = `${record.year}-${record.month}`;
      if (!monthMap.has(key)) {
        monthMap.set(key, {
          year: record.year,
          month: record.month,
          userIds: new Set(),
          totalMs: BigInt(0),
        });
      }
      const monthData = monthMap.get(key)!;
      monthData.userIds.add(record.userId);
      monthData.totalMs += record.totalMs;
    }

    // Convert to array and sort by year/month descending
    return Array.from(monthMap.values())
      .map((data) => ({
        year: data.year,
        month: data.month,
        userCount: data.userIds.size,
        totalHours: Math.floor(Number(data.totalMs) / 1000 / 60 / 60),
      }))
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
  }

  // Internals
  private async ensureUser(discordId: string) {
    try {
      await (prisma as any).user.upsert({
        where: { discordId },
        create: { discordId },
        update: {},
      });
    } catch (e) {
      console.error("[PatrolTimer] ensureUser failed", e);
    }
  }
  private async persistMonthly(
    guildId: string,
    userId: string,
    startedAt: Date,
    endedAt: Date,
  ) {
    // Split [startedAt, endedAt) across months in UTC and increment each bucket
    let curStart = new Date(startedAt);
    const endMs = endedAt.getTime();

    while (curStart.getTime() < endMs) {
      const y = curStart.getUTCFullYear();
      const m = curStart.getUTCMonth(); // 0-11
      const nextMonthStart = new Date(
        Date.UTC(m === 11 ? y + 1 : y, (m + 1) % 12, 1, 0, 0, 0, 0),
      );
      const segmentEndMs = Math.min(endMs, nextMonthStart.getTime());
      const segDelta = segmentEndMs - curStart.getTime();
      if (segDelta > 0) {
        await (prisma as any).voicePatrolMonthlyTime.upsert({
          where: {
            guildId_userId_year_month: {
              guildId,
              userId,
              year: y,
              month: m + 1,
            },
          },
          update: { totalMs: { increment: BigInt(segDelta) } },
          create: {
            guildId,
            userId,
            year: y,
            month: m + 1,
            totalMs: BigInt(segDelta),
          },
        });
      }
      curStart = new Date(segmentEndMs);
    }
  }
}
// No default export; a singleton is created and exported from main.ts
