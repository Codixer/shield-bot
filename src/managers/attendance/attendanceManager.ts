import type { CommandInteraction } from "discord.js";
import { prisma } from "../../main.js";

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

  async addUserToSquad(
    eventId: number,
    userId: number | undefined,
    squadName: string,
  ) {
    if (!userId)
      throw new Error(
        "User ID is undefined. Make sure the user exists in the database.",
      );
    let squad = await prisma.squad.findFirst({
      where: { eventId, name: squadName },
    });
    if (!squad) {
      squad = await prisma.squad.create({ data: { eventId, name: squadName } });
    }
    return prisma.squadMember.create({ data: { userId, squadId: squad.id } });
  }

  async removeUserFromEvent(eventId: number, userId: number) {
    // Instead of deleting, mark as left to preserve attendance record
    await this.markUserAsLeft(eventId, userId);
  }

  async forceRemoveUserFromEvent(eventId: number, userId: number) {
    // This method completely removes the user from the event (original behavior)
    const squads = await prisma.squad.findMany({ where: { eventId } });
    for (const squad of squads) {
      await prisma.squadMember.deleteMany({
        where: { squadId: squad.id, userId },
      });
    }
    await prisma.attendanceStaff.deleteMany({ where: { eventId, userId } });
  }

  async moveUserToSquad(eventId: number, userId: number, newSquadName: string) {
    const squads = await prisma.squad.findMany({ where: { eventId } });
    for (const squad of squads) {
      await prisma.squadMember.deleteMany({
        where: { squadId: squad.id, userId },
      });
    }
    const result = await this.addUserToSquad(eventId, userId, newSquadName);

    // Clear the left status when moving to a new squad
    const member = await prisma.squadMember.findFirst({
      where: { squad: { eventId, name: newSquadName }, userId },
    });
    if (member) {
      await prisma.squadMember.update({
        where: { id: member.id },
        data: { hasLeft: false },
      });
    }

    return result;
  }

  async markUserAsLead(eventId: number, userId: number) {
    const member = await prisma.squadMember.findFirst({
      where: { squad: { eventId }, userId },
    });
    if (member) {
      await prisma.squadMember.update({
        where: { id: member.id },
        data: { isLead: true },
      });
    }
  }

  async markUserAsLate(eventId: number, userId: number) {
    const member = await prisma.squadMember.findFirst({
      where: { squad: { eventId }, userId },
    });
    if (member) {
      await prisma.squadMember.update({
        where: { id: member.id },
        data: { isLate: true },
      });
    }
  }

  async markUserAsSplit(
    eventId: number,
    userId: number,
    newSquadName: string,
    splitFrom: string,
  ) {
    await this.moveUserToSquad(eventId, userId, newSquadName);
    const member = await prisma.squadMember.findFirst({
      where: { squad: { eventId, name: newSquadName }, userId },
    });
    if (member) {
      await prisma.squadMember.update({
        where: { id: member.id },
        data: { isSplit: true, splitFrom },
      });
    }
  }

  async addStaff(eventId: number, userId: number) {
    // Find if a staff entry already exists for this event/user
    const existing = await prisma.attendanceStaff.findFirst({
      where: { eventId, userId },
    });
    if (existing) {
      return existing;
    }
    return prisma.attendanceStaff.create({ data: { eventId, userId } });
  }

  async setCohost(eventId: number, userId: number) {
    return prisma.attendanceEvent.update({
      where: { id: eventId },
      data: { cohostId: userId },
    });
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
    if (!discordId)
      throw new Error("Discord ID is undefined. Cannot find or create user.");
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
    const active = await prisma.activeAttendanceEvent.findUnique({
      where: { userId },
    });
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
      await interaction.reply({
        content:
          "You do not have an active event. Use /vrchat attendance createevent first.",
        flags: 64,
      });
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
    // Clear active event references
    await prisma.activeAttendanceEvent.deleteMany({ where: { eventId } });
    // Delete the event itself
    await prisma.attendanceEvent.delete({ where: { id: eventId } });
  }

  // Get events accessible to a user (host, cohost, or has participated)
  async getUserEvents(userId: number) {
    return prisma.attendanceEvent.findMany({
      where: {
        OR: [
          { hostId: userId },
          { cohostId: userId },
          {
            staff: {
              some: { userId },
            },
          },
          {
            squads: {
              some: {
                members: {
                  some: { userId },
                },
              },
            },
          },
        ],
      },
      include: {
        host: true,
        cohost: true,
        staff: true,
        squads: {
          include: {
            members: true,
          },
        },
      },
      orderBy: {
        date: "desc",
      },
    });
  }

  // Get all events (for selection/assistance by anyone)
  async getAllEvents() {
    return prisma.attendanceEvent.findMany({
      include: {
        host: true,
        cohost: true,
        staff: true,
        squads: {
          include: {
            members: true,
          },
        },
      },
      orderBy: {
        date: "desc",
      },
    });
  }

  // Get event by ID
  async getEventById(eventId: number) {
    return prisma.attendanceEvent.findUnique({
      where: { id: eventId },
      include: {
        host: true,
        cohost: true,
      },
    });
  }

  // Mark user as left
  async markUserAsLeft(eventId: number, userId: number) {
    const member = await prisma.squadMember.findFirst({
      where: { squad: { eventId }, userId },
    });
    if (member) {
      await prisma.squadMember.update({
        where: { id: member.id },
        data: { hasLeft: true },
      });
    }
  }
}
