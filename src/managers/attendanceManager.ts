import { PrismaClient } from '@prisma/client';

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

  async addUserToSquad(eventId: number, userId: number, squadName: string) {
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
}
