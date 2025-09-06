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
  }

  // Settings helpers
  async getSettings(guildId: string) {
    let settings = await (prisma as any).voicePatrolSettings.findUnique({ where: { guildId } });
    if (!settings) {
      settings = await (prisma as any).voicePatrolSettings.create({ data: { guildId } });
    }
    return settings;
  }

  async setBotuserRole(guildId: string, roleId: string | null) {
    await this.getSettings(guildId); // ensure row
  await (prisma as any).voicePatrolSettings.update({ where: { guildId }, data: { botuserRoleId: roleId ?? null } });
  }

  async setCategory(guildId: string, categoryId: string | null) {
    await this.getSettings(guildId); // ensure row
  await (prisma as any).voicePatrolSettings.update({ where: { guildId }, data: { channelCategoryId: categoryId ?? null } });
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
      if (!settings.channelCategoryId) return; // not configured

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
        return (ch as VoiceChannel).parentId === settings.channelCategoryId;
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
    // Upsert DB row and increment time
  await (prisma as any).voicePatrolTime.upsert({
      where: { guildId_userId: { guildId, userId: member.id } },
      update: { totalMs: { increment: BigInt(delta) } },
      create: { guildId, userId: member.id, totalMs: BigInt(delta) },
    });

    // Also persist monthly totals, splitting across month boundaries (UTC)
    await this.persistMonthly(guildId, member.id, tracked.startedAt, new Date(nowMs));
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
      take: limit && limit > 0 ? Math.min(limit, 1000) : undefined,
    });
    return rows;
  }

  async getTopByMonth(guildId: string, year: number, month: number, limit?: number) {
    const rows = await (prisma as any).voicePatrolMonthlyTime.findMany({
      where: { guildId, year, month },
      orderBy: { totalMs: "desc" },
      take: limit && limit > 0 ? Math.min(limit, 1000) : undefined,
    });
    return rows;
  }

  async getUserTotalForMonth(guildId: string, userId: string, year: number, month: number) {
    const row = await (prisma as any).voicePatrolMonthlyTime.findUnique({
      where: { guildId_userId_year_month: { guildId, userId, year, month } },
    });
    return row?.totalMs ? Number(row.totalMs) : 0;
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
    return rows;
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

  // Internals
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
