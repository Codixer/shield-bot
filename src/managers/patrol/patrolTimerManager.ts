import { Client, ChannelType, Guild, GuildMember, VoiceChannel, VoiceState } from "discord.js";
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

  constructor(client: Client) {
    this.client = client;
  }

  async init() {
    // Warm tracked maps for all guilds the bot is in
    for (const guild of this.client.guilds.cache.values()) {
      this.tracked.set(guild.id, new Map());
    }

    // On startup, scan current voice states and resume tracking for members
    // already connected to channels within the configured category.
    for (const guild of this.client.guilds.cache.values()) {
      try {
  await this.resumeActiveForGuild(guild);
      } catch (err) {
        console.error(`[PatrolTimer] Failed to resume active sessions for guild ${guild.id}:`, err);
      }
    }
  }

  // Settings helpers
  async getSettings(guildId: string) {
    let settings = await (prisma as any).guildSettings.findUnique({ where: { guildId } });
    if (!settings) {
      settings = await (prisma as any).guildSettings.create({ data: { guildId } });
    }
    // One-time backfill from legacy VoicePatrolSettings table if present
    if (!settings.patrolBotuserRoleId || !settings.patrolChannelCategoryId) {
      try {
        const rows = await (prisma as any).$queryRaw`SELECT botuserRoleId, channelCategoryId FROM VoicePatrolSettings WHERE guildId = ${guildId} LIMIT 1`;
        const legacy = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        if (legacy) {
          const patch: any = {};
          if (legacy.botuserRoleId && !settings.patrolBotuserRoleId) patch.patrolBotuserRoleId = legacy.botuserRoleId as string;
          if (legacy.channelCategoryId && !settings.patrolChannelCategoryId) patch.patrolChannelCategoryId = legacy.channelCategoryId as string;
          if (Object.keys(patch).length > 0) {
            settings = await (prisma as any).guildSettings.update({ where: { guildId }, data: patch });
          }
        }
      } catch (_) {
        // ignore if table doesn't exist
      }
    }
    return settings as { guildId: string; patrolBotuserRoleId?: string | null; patrolChannelCategoryId?: string | null };
  }

  async setBotuserRole(guildId: string, roleId: string | null) {
    await this.getSettings(guildId); // ensure row
    await (prisma as any).guildSettings.update({ where: { guildId }, data: { patrolBotuserRoleId: roleId ?? null } });
  }

  async setCategory(guildId: string, categoryId: string | null) {
    await this.getSettings(guildId); // ensure row
    await (prisma as any).guildSettings.update({ where: { guildId }, data: { patrolChannelCategoryId: categoryId ?? null } });
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
        return (ch as VoiceChannel).parentId === settings.patrolChannelCategoryId;
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

  private startTracking(guildId: string, member: GuildMember, channelId: string) {
    if (member.user.bot) return;
    if (!this.tracked.has(guildId)) this.tracked.set(guildId, new Map());
    const guildMap = this.tracked.get(guildId)!;
  // Avoid clobbering an existing tracking session (e.g., during startup scan)
  if (guildMap.has(member.id)) return;
    guildMap.set(member.id, { userId: member.id, channelId, startedAt: new Date() });
    // console.log(`[PatrolTimer] Start ${member.user.tag} in ${channelId}`);
  }

  private async stopTrackingAndPersist(guildId: string, member: GuildMember) {
    const guildMap = this.tracked.get(guildId);
    if (!guildMap) return;
    const tracked = guildMap.get(member.id);
    if (!tracked) return;
    // If switching channels within same category, we still finalize from old channel
    const nowMs = Date.now();
    const delta = nowMs - tracked.startedAt.getTime();
    guildMap.delete(member.id);
    if (delta < 3000) return; // ignore very short joins; parity with original impl
  // Ensure a corresponding User row exists for this Discord ID
  await this.ensureUser(member.id);
  // Upsert DB row and increment time
  await (prisma as any).voicePatrolTime.upsert({
      where: { guildId_userId: { guildId, userId: member.id } },
      update: { totalMs: { increment: BigInt(delta) } },
      create: { guildId, userId: member.id, totalMs: BigInt(delta) },
    });

    // Also persist monthly totals, splitting across month boundaries (UTC)
    await this.persistMonthly(guildId, member.id, tracked.startedAt, new Date(nowMs));
  }

  /** Scan the guild's voice channels within the tracked category and start tracking present members. */
  private async resumeActiveForGuild(guild: Guild): Promise<void> {
    const settings = await this.getSettings(guild.id);
    if (!settings.patrolChannelCategoryId) return;

    // Find all voice channels under the tracked category
    const voiceChannels = guild.channels.cache.filter(
      (c): c is VoiceChannel => c?.type === ChannelType.GuildVoice && (c as VoiceChannel).parentId === settings.patrolChannelCategoryId
    );

    if (!voiceChannels.size) return;

    for (const ch of voiceChannels.values()) {
      // ch.members contains members currently connected to this voice channel
      for (const member of ch.members.values()) {
        if (member.user.bot) continue;
        this.startTracking(guild.id, member, ch.id);
      }
    }
  }

  // Commands
  async getCurrentTrackedList(guildId: string) {
    const guildMap = this.tracked.get(guildId);
    if (!guildMap) return [] as Array<{ userId: string; ms: number; channelId: string }>;
    const now = Date.now();
    const arr: Array<{ userId: string; ms: number; channelId: string }> = [];
    for (const tu of guildMap.values()) {
      arr.push({ userId: tu.userId, channelId: tu.channelId, ms: now - tu.startedAt.getTime() });
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
        const delta = now - tu.startedAt.getTime();
        if (delta > 0) byUser[tu.userId] = (byUser[tu.userId] ?? 0) + delta;
      }
    }

    // To array and sort desc
    const arr = Object.entries(byUser)
      .map(([userId, totalMs]) => ({ userId, totalMs }))
      .sort((a, b) => b.totalMs - a.totalMs);

    const limited = limit && limit > 0 ? arr.slice(0, Math.min(limit, 1000)) : arr;

    // Return in a shape similar to prisma rows expected by command code
    return limited.map((r) => ({ userId: r.userId, totalMs: BigInt(Math.max(0, Math.floor(r.totalMs))) }));
  }

  async getTopByMonth(guildId: string, year: number, month: number, limit?: number) {
    const rows = await (prisma as any).voicePatrolMonthlyTime.findMany({
      where: { guildId, year, month },
      orderBy: { totalMs: "desc" },
      take: undefined,
    });
    // Merge live delta if querying the current UTC month
    const now = new Date();
    const isCurrentMonth = (now.getUTCFullYear() === year) && (now.getUTCMonth() + 1 === month);
    if (!isCurrentMonth) {
      const limited = limit && limit > 0 ? rows.slice(0, Math.min(limit, 1000)) : rows;
      return limited;
    }

    const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)).getTime();
    const nowMs = now.getTime();
    const guildMap = this.tracked.get(guildId);
    const byUser: Record<string, number> = {};

    for (const r of rows) byUser[r.userId] = Number(r.totalMs);

    if (guildMap) {
      for (const tu of guildMap.values()) {
        const startMs = Math.max(tu.startedAt.getTime(), monthStart);
        const delta = Math.max(0, nowMs - startMs);
        if (delta > 0) byUser[tu.userId] = (byUser[tu.userId] ?? 0) + delta;
      }
    }

    const arr = Object.entries(byUser)
      .map(([userId, totalMs]) => ({ userId, totalMs }))
      .sort((a, b) => b.totalMs - a.totalMs);
    const limited = limit && limit > 0 ? arr.slice(0, Math.min(limit, 1000)) : arr;
    return limited.map(r => ({ userId: r.userId, totalMs: BigInt(Math.max(0, Math.floor(r.totalMs))) }));
  }

  async getUserTotalForMonth(guildId: string, userId: string, year: number, month: number) {
    const row = await (prisma as any).voicePatrolMonthlyTime.findUnique({
      where: { guildId_userId_year_month: { guildId, userId, year, month } },
    });
    let base = row?.totalMs ? Number(row.totalMs) : 0;

    // Add live delta for current month if user is currently tracked
    const now = new Date();
    const isCurrentMonth = (now.getUTCFullYear() === year) && (now.getUTCMonth() + 1 === month);
    if (isCurrentMonth) {
      const guildMap = this.tracked.get(guildId);
      const tu = guildMap?.get(userId);
      if (tu) {
        const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)).getTime();
        const startMs = Math.max(tu.startedAt.getTime(), monthStart);
        const delta = Math.max(0, Date.now() - startMs);
        base += delta;
      }
    }
    return base;
  }

  async getTopForChannel(guild: Guild, channelId: string) {
    // Get members in this voice channel
  const members = guild.members.cache.filter(m => !m.user.bot && (m.voice?.channelId === channelId));
    const ids = members.map(m => m.id);
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
        const delta = now - tu.startedAt.getTime();
        if (delta > 0) byUser[tu.userId] = (byUser[tu.userId] ?? 0) + delta;
      }
    }

    const arr = Object.entries(byUser)
      .map(([userId, totalMs]) => ({ userId, totalMs }))
      .sort((a, b) => b.totalMs - a.totalMs);

    return arr.map((r) => ({ userId: r.userId, totalMs: BigInt(Math.max(0, Math.floor(r.totalMs))) }));
  }

  async reset(guildId: string, userId?: string) {
    if (userId) {
      await (prisma as any).voicePatrolTime.updateMany({ where: { guildId, userId }, data: { totalMs: BigInt(0) } });
    } else {
      await (prisma as any).voicePatrolTime.updateMany({ where: { guildId }, data: { totalMs: BigInt(0) } });
    }
  }

  async wipe(guildId: string) {
    await (prisma as any).voicePatrolTime.deleteMany({ where: { guildId } });
    await (prisma as any).voicePatrolMonthlyTime.deleteMany({ where: { guildId } });
  }

  async getUserTotal(guildId: string, userId: string) {
    const row = await (prisma as any).voicePatrolTime.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    let base = row?.totalMs ? Number(row.totalMs) : 0;
    // Add live delta
    const guildMap = this.tracked.get(guildId);
    const tu = guildMap?.get(userId);
    if (tu) {
      const delta = Date.now() - tu.startedAt.getTime();
      base += delta;
    }
    return base;
  }

  // Internals
  private async ensureUser(discordId: string) {
    try {
      await (prisma as any).user.upsert({ where: { discordId }, create: { discordId }, update: {} });
    } catch (e) {
      console.error("[PatrolTimer] ensureUser failed", e);
    }
  }
  private async persistMonthly(guildId: string, userId: string, startedAt: Date, endedAt: Date) {
    // Split [startedAt, endedAt) across months in UTC and increment each bucket
    let curStart = new Date(startedAt);
    const endMs = endedAt.getTime();

    while (curStart.getTime() < endMs) {
      const y = curStart.getUTCFullYear();
      const m = curStart.getUTCMonth(); // 0-11
      const nextMonthStart = new Date(Date.UTC(m === 11 ? y + 1 : y, (m + 1) % 12, 1, 0, 0, 0, 0));
      const segmentEndMs = Math.min(endMs, nextMonthStart.getTime());
      const segDelta = segmentEndMs - curStart.getTime();
      if (segDelta > 0) {
        await (prisma as any).voicePatrolMonthlyTime.upsert({
          where: { guildId_userId_year_month: { guildId, userId, year: y, month: m + 1 } },
          update: { totalMs: { increment: BigInt(segDelta) } },
          create: { guildId, userId, year: y, month: m + 1, totalMs: BigInt(segDelta) },
        });
      }
      curStart = new Date(segmentEndMs);
    }
  }
}
// No default export; a singleton is created and exported from main.ts
