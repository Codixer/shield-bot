import { PrismaClient } from '@prisma/client';
import type { CommandInteraction } from "discord.js";
import fetch from 'node-fetch';

const prisma = new PrismaClient();

export class AttendanceManager {
  async createEvent(date: Date, hostId?: number, cohostId?: number) {
    return prisma.attendanceEvent.create({
      data: {
        date,
        hostId,
        cohostId,
      },
    });
  }

  async addUserToSquad(eventId: number, userId: number | undefined, squadName: string) {
    if (!userId) throw new Error("User ID is undefined. Make sure the user exists in the database.");
    let squad = await prisma.squad.findFirst({ where: { eventId, name: squadName } });
    if (!squad) {
      squad = await prisma.squad.create({ data: { eventId, name: squadName } });
    }
    return prisma.squadMember.create({ data: { userId, squadId: squad.id } });
  }

  async removeUserFromEvent(eventId: number, userId: number) {
    const squads = await prisma.squad.findMany({ where: { eventId } });
    for (const squad of squads) {
      await prisma.squadMember.deleteMany({ where: { squadId: squad.id, userId } });
    }
    await prisma.attendanceStaff.deleteMany({ where: { eventId, userId } });
  }

  async moveUserToSquad(eventId: number, userId: number, newSquadName: string) {
    const squads = await prisma.squad.findMany({ where: { eventId } });
    for (const squad of squads) {
      await prisma.squadMember.deleteMany({ where: { squadId: squad.id, userId } });
    }
    return this.addUserToSquad(eventId, userId, newSquadName);
  }

  async markUserAsLead(eventId: number, userId: number) {
    const member = await prisma.squadMember.findFirst({
      where: { squad: { eventId }, userId },
    });
    if (member) {
      await prisma.squadMember.update({ where: { id: member.id }, data: { isLead: true } });
    }
  }

  async markUserAsLate(eventId: number, userId: number, note?: string) {
    const member = await prisma.squadMember.findFirst({
      where: { squad: { eventId }, userId },
    });
    if (member) {
      await prisma.squadMember.update({ where: { id: member.id }, data: { isLate: true, lateNote: note } });
    }
  }

  async markUserAsSplit(eventId: number, userId: number, newSquadName: string, splitFrom: string) {
    await this.moveUserToSquad(eventId, userId, newSquadName);
    const member = await prisma.squadMember.findFirst({
      where: { squad: { eventId, name: newSquadName }, userId },
    });
    if (member) {
      await prisma.squadMember.update({ where: { id: member.id }, data: { isSplit: true, splitFrom } });
    }
  }

  async addStaff(eventId: number, userId: number) {
    // Find if a staff entry already exists for this event/user
    const existing = await prisma.attendanceStaff.findFirst({ where: { eventId, userId } });
    if (existing) {
      return existing;
    }
    return prisma.attendanceStaff.create({ data: { eventId, userId } });
  }

  async setCohost(eventId: number, userId: number) {
    return prisma.attendanceEvent.update({ where: { id: eventId }, data: { cohostId: userId } });
  }

  async getEventSummary(eventId: number) {
    return prisma.attendanceEvent.findUnique({
      where: { id: eventId },
      include: {
        host: true,
        cohost: true,
        staff: { include: { user: true } },
        squads: {
          include: {
            members: { include: { user: true } },
          },
        },
      },
    });
  }

  // Find or create a user by Discord ID
  async findOrCreateUserByDiscordId(discordId: string | undefined) {
    if (!discordId) throw new Error("Discord ID is undefined. Cannot find or create user.");
    let user = await prisma.user.findUnique({ where: { discordId } });
    if (!user) {
      user = await prisma.user.create({ data: { discordId } });
    }
    return user;
  }

  // Set the active event for a user (by userId)
  async setActiveEventForUser(userId: number, eventId: number) {
    // Store in a simple table: ActiveAttendanceEvent { id, userId, eventId }
    await prisma.activeAttendanceEvent.upsert({
      where: { userId },
      update: { eventId },
      create: { userId, eventId },
    });
  }

  // Get the active event for a user (by userId)
  async getActiveEventIdForUser(userId: number) {
    const active = await prisma.activeAttendanceEvent.findUnique({ where: { userId } });
    return active?.eventId;
  }

  // Clear the active event for a user (by userId)
  async clearActiveEventForUser(userId: number) {
    await prisma.activeAttendanceEvent.deleteMany({ where: { userId } });
  }

  // Helper to get the active event for the current user
  async getActiveEventForInteraction(interaction: CommandInteraction) {
    const discordId = interaction.user.id;
    const user = await this.findOrCreateUserByDiscordId(discordId);
    const eventId = await this.getActiveEventIdForUser(user.id);
    if (!eventId) {
      await interaction.reply({ content: "You do not have an active event. Use /vrchat attendance createevent first.", flags: 64 });
      return null;
    }
    return { eventId, user };
  }

  // Delete all data related to an event (squads, squad members, staff, etc.)
  async deleteEventData(eventId: number) {
    // Delete all squad members for squads in this event
    const squads = await prisma.squad.findMany({ where: { eventId } });
    for (const squad of squads) {
      await prisma.squadMember.deleteMany({ where: { squadId: squad.id } });
    }
    // Delete all squads for this event
    await prisma.squad.deleteMany({ where: { eventId } });
    // Delete all staff for this event
    await prisma.attendanceStaff.deleteMany({ where: { eventId } });
    // Optionally, delete the event itself (uncomment if desired)
    await prisma.attendanceEvent.delete({ where: { id: eventId } });
  }

  // Discord Activity Integration Methods

  /**
   * Create a new attendance event linked to a Discord Activity instance
   */
  async createActivityEvent(discordInstanceId: string, discordUserId: string) {
    const today = new Date();
    
    // Find or create the user by Discord ID
    const user = await this.findOrCreateUserByDiscordId(discordUserId);
    
    // Create the event
    const event = await prisma.attendanceEvent.create({
      data: {
        date: today,
        hostId: user.id,
      },
    });

    // Create the activity mapping
    await prisma.activityAttendanceMapping.create({
      data: {
        discordInstanceId,
        attendanceEventId: event.id,
      },
    });

    return event;
  }

  /**
   * Get the active event for a Discord Activity instance
   */
  async getActiveEventByInstanceId(discordInstanceId: string) {
    const mapping = await prisma.activityAttendanceMapping.findUnique({
      where: { discordInstanceId },
      include: { attendanceEvent: true },
    });
    
    return mapping?.attendanceEvent || null;
  }

  /**
   * Add user to squad by Discord Activity instance
   */
  async addUserToSquadByInstance(discordInstanceId: string, discordUserId: string, squadName: string) {
    const event = await this.getActiveEventByInstanceId(discordInstanceId);
    if (!event) {
      throw new Error("No active event found for this activity instance");
    }
    
    const dbUser = await this.findOrCreateUserByDiscordId(discordUserId);
    return await this.addUserToSquad(event.id, dbUser.id, squadName);
  }

  /**
   * Remove user from event by Discord Activity instance
   */
  async removeUserFromEventByInstance(discordInstanceId: string, discordUserId: string) {
    const event = await this.getActiveEventByInstanceId(discordInstanceId);
    if (!event) {
      throw new Error("No active event found for this activity instance");
    }
    
    const dbUser = await this.findOrCreateUserByDiscordId(discordUserId);
    return await this.removeUserFromEvent(event.id, dbUser.id);
  }

  /**
   * Move user to squad by Discord Activity instance
   */
  async moveUserToSquadByInstance(discordInstanceId: string, discordUserId: string, squadName: string) {
    const event = await this.getActiveEventByInstanceId(discordInstanceId);
    if (!event) {
      throw new Error("No active event found for this activity instance");
    }
    
    const dbUser = await this.findOrCreateUserByDiscordId(discordUserId);
    return await this.moveUserToSquad(event.id, dbUser.id, squadName);
  }

  /**
   * Mark user as lead by Discord Activity instance
   */
  async markUserAsLeadByInstance(discordInstanceId: string, discordUserId: string) {
    const event = await this.getActiveEventByInstanceId(discordInstanceId);
    if (!event) {
      throw new Error("No active event found for this activity instance");
    }
    
    const dbUser = await this.findOrCreateUserByDiscordId(discordUserId);
    return await this.markUserAsLead(event.id, dbUser.id);
  }

  /**
   * Mark user as late by Discord Activity instance
   */
  async markUserAsLateByInstance(discordInstanceId: string, discordUserId: string, note?: string) {
    const event = await this.getActiveEventByInstanceId(discordInstanceId);
    if (!event) {
      throw new Error("No active event found for this activity instance");
    }
    
    const dbUser = await this.findOrCreateUserByDiscordId(discordUserId);
    return await this.markUserAsLate(event.id, dbUser.id, note);
  }

  /**
   * Split user to squad by Discord Activity instance
   */
  async markUserAsSplitByInstance(discordInstanceId: string, discordUserId: string, newSquadName: string, splitFrom: string) {
    const event = await this.getActiveEventByInstanceId(discordInstanceId);
    if (!event) {
      throw new Error("No active event found for this activity instance");
    }
    
    const dbUser = await this.findOrCreateUserByDiscordId(discordUserId);
    return await this.markUserAsSplit(event.id, dbUser.id, newSquadName, splitFrom);
  }

  /**
   * Add staff by Discord Activity instance
   */
  async addStaffByInstance(discordInstanceId: string, discordUserId: string) {
    const event = await this.getActiveEventByInstanceId(discordInstanceId);
    if (!event) {
      throw new Error("No active event found for this activity instance");
    }
    
    const dbUser = await this.findOrCreateUserByDiscordId(discordUserId);
    return await this.addStaff(event.id, dbUser.id);
  }

  /**
   * Set cohost by Discord Activity instance
   */
  async setCohostByInstance(discordInstanceId: string, discordUserId: string) {
    const event = await this.getActiveEventByInstanceId(discordInstanceId);
    if (!event) {
      throw new Error("No active event found for this activity instance");
    }
    
    const dbUser = await this.findOrCreateUserByDiscordId(discordUserId);
    return await this.setCohost(event.id, dbUser.id);
  }

  /**
   * Get event summary by Discord Activity instance
   */
  async getEventSummaryByInstance(discordInstanceId: string) {
    const event = await this.getActiveEventByInstanceId(discordInstanceId);
    if (!event) {
      return null;
    }
    
    return await this.getEventSummary(event.id);
  }

  /**
   * Validate Discord access token and return user information
   */
  async validateDiscordToken(accessToken: string) {
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Invalid Discord access token');
    }

    return await response.json();
  }
}
