import { Post, Delete, Put, Router } from "@discordx/koa";
import type { Context } from "koa";
import { AttendanceManager } from "../../managers/attendanceManager.js";

const attendanceManager = new AttendanceManager();

@Router()
export class SquadMemberApi {
  @Post("/api/attendance/events/:eventId/squads/:squadName/members")
  async addUserToSquad(context: Context) {
    try {
      const { eventId, squadName } = context.params as { eventId: string; squadName: string };
      const { userId } = context.request.body as { userId?: number };
      const parsedEventId = Number(eventId);

      if (isNaN(parsedEventId) || !userId || !squadName.trim()) {
        context.status = 400;
        context.body = { error: "Invalid eventId, userId, or squadName" };
        return;
      }

      const member = await attendanceManager.addUserToSquad(parsedEventId, userId, squadName.trim());
      context.status = 201;
      context.body = member;
    } catch (error) {
      console.error("Error adding user to squad:", error);
      context.status = 500;
      context.body = { error: "Internal server error" };
    }
  }

  @Delete("/api/attendance/events/:eventId/users/:userId")
  async removeUserFromEvent(context: Context) {
    try {
      const { eventId, userId } = context.params as { eventId: string; userId: string };
      const parsedEventId = Number(eventId);
      const parsedUserId = Number(userId);

      if (isNaN(parsedEventId) || isNaN(parsedUserId)) {
        context.status = 400;
        context.body = { error: "Invalid eventId or userId" };
        return;
      }

      await attendanceManager.removeUserFromEvent(parsedEventId, parsedUserId);
      context.status = 204;
    } catch (error) {
      console.error("Error removing user from event:", error);
      context.status = 500;
      context.body = { error: "Internal server error" };
    }
  }

  @Put("/api/attendance/events/:eventId/users/:userId/move")
  async moveUserToSquad(context: Context) {
    try {
      const { eventId, userId } = context.params as { eventId: string; userId: string };
      const { squadName } = context.request.body as { squadName?: string };
      const parsedEventId = Number(eventId);
      const parsedUserId = Number(userId);

      if (isNaN(parsedEventId) || isNaN(parsedUserId) || !squadName?.trim()) {
        context.status = 400;
        context.body = { error: "Invalid eventId, userId, or squadName" };
        return;
      }

      const member = await attendanceManager.moveUserToSquad(parsedEventId, parsedUserId, squadName.trim());
      context.body = member;
    } catch (error) {
      console.error("Error moving user to squad:", error);
      context.status = 500;
      context.body = { error: "Internal server error" };
    }
  }

  @Put("/api/attendance/events/:eventId/users/:userId/lead")
  async markUserAsLead(context: Context) {
    try {
      const { eventId, userId } = context.params as { eventId: string; userId: string };
      const parsedEventId = Number(eventId);
      const parsedUserId = Number(userId);

      if (isNaN(parsedEventId) || isNaN(parsedUserId)) {
        context.status = 400;
        context.body = { error: "Invalid eventId or userId" };
        return;
      }

      await attendanceManager.markUserAsLead(parsedEventId, parsedUserId);
      context.status = 204;
    } catch (error) {
      console.error("Error marking user as lead:", error);
      context.status = 500;
      context.body = { error: "Internal server error" };
    }
  }

  @Put("/api/attendance/events/:eventId/users/:userId/late")
  async markUserAsLate(context: Context) {
    try {
      const { eventId, userId } = context.params as { eventId: string; userId: string };
      const { note } = context.request.body as { note?: string };
      const parsedEventId = Number(eventId);
      const parsedUserId = Number(userId);

      if (isNaN(parsedEventId) || isNaN(parsedUserId)) {
        context.status = 400;
        context.body = { error: "Invalid eventId or userId" };
        return;
      }

      await attendanceManager.markUserAsLate(parsedEventId, parsedUserId, note);
      context.status = 204;
    } catch (error) {
      console.error("Error marking user as late:", error);
      context.status = 500;
      context.body = { error: "Internal server error" };
    }
  }

  @Put("/api/attendance/events/:eventId/users/:userId/split")
  async markUserAsSplit(context: Context) {
    try {
      const { eventId, userId } = context.params as { eventId: string; userId: string };
      const { newSquadName, splitFrom } = context.request.body as { 
        newSquadName?: string; 
        splitFrom?: string; 
      };
      const parsedEventId = Number(eventId);
      const parsedUserId = Number(userId);

      if (isNaN(parsedEventId) || isNaN(parsedUserId) || !newSquadName?.trim() || !splitFrom?.trim()) {
        context.status = 400;
        context.body = { error: "Invalid eventId, userId, newSquadName, or splitFrom" };
        return;
      }

      await attendanceManager.markUserAsSplit(
        parsedEventId, 
        parsedUserId, 
        newSquadName.trim(), 
        splitFrom.trim()
      );
      context.status = 204;
    } catch (error) {
      console.error("Error marking user as split:", error);
      context.status = 500;
      context.body = { error: "Internal server error" };
    }
  }

  @Post("/api/attendance/events/:eventId/staff")
  async addStaffMember(context: Context) {
    try {
      const { eventId } = context.params as { eventId: string };
      const { userId } = context.request.body as { userId?: number };
      const parsedEventId = Number(eventId);

      if (isNaN(parsedEventId) || !userId) {
        context.status = 400;
        context.body = { error: "Invalid eventId or userId" };
        return;
      }

      await attendanceManager.addStaff(parsedEventId, userId);
      context.status = 204;
    } catch (error) {
      console.error("Error adding staff member:", error);
      context.status = 500;
      context.body = { error: "Internal server error" };
    }
  }

  @Put("/api/attendance/events/:eventId/cohost")
  async setCohost(context: Context) {
    try {
      const { eventId } = context.params as { eventId: string };
      const { userId } = context.request.body as { userId?: number };
      const parsedEventId = Number(eventId);

      if (isNaN(parsedEventId) || !userId) {
        context.status = 400;
        context.body = { error: "Invalid eventId or userId" };
        return;
      }

      await attendanceManager.setCohost(parsedEventId, userId);
      context.status = 204;
    } catch (error) {
      console.error("Error setting cohost:", error);
      context.status = 500;
      context.body = { error: "Internal server error" };
    }
  }
}
