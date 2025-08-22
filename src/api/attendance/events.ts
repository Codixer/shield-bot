import { Post, Get, Delete, Put, Router } from "@discordx/koa";
import type { Context } from "koa";
import { AttendanceManager } from "../../managers/attendanceManager.js";

const attendanceManager = new AttendanceManager();

@Router()
export class AttendanceEventApi {
  @Post("/api/attendance/events")
  async createEvent(context: Context) {
    try {
      const { date, hostId, cohostId } = context.request.body as {
        date?: string;
        hostId?: number;
        cohostId?: number;
      };

      if (!date) {
        context.status = 400;
        context.body = { error: "date required" };
        return;
      }

      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        context.status = 400;
        context.body = { error: "Invalid date format" };
        return;
      }

      const event = await attendanceManager.createEvent(parsedDate, hostId, cohostId);
      context.status = 201;
      context.body = event;
    } catch (error) {
      console.error("Error creating event:", error);
      context.status = 500;
      context.body = { error: "Internal server error" };
    }
  }

  @Get("/api/attendance/events/:eventId")
  async getEventDetails(context: Context) {
    try {
      const { eventId } = context.params as { eventId: string };
      const parsedEventId = Number(eventId);

      if (isNaN(parsedEventId)) {
        context.status = 400;
        context.body = { error: "Invalid eventId" };
        return;
      }

      const event = await attendanceManager.getEventSummary(parsedEventId);
      if (!event) {
        context.status = 404;
        context.body = { error: "Event not found" };
        return;
      }

      context.body = event;
    } catch (error) {
      console.error("Error getting event details:", error);
      context.status = 500;
      context.body = { error: "Internal server error" };
    }
  }

  @Delete("/api/attendance/events/:eventId")
  async deleteEvent(context: Context) {
    try {
      const { eventId } = context.params as { eventId: string };
      const parsedEventId = Number(eventId);

      if (isNaN(parsedEventId)) {
        context.status = 400;
        context.body = { error: "Invalid eventId" };
        return;
      }

      await attendanceManager.deleteEventData(parsedEventId);
      context.status = 204;
    } catch (error) {
      console.error("Error deleting event:", error);
      context.status = 500;
      context.body = { error: "Internal server error" };
    }
  }

  @Get("/api/attendance/users/:userId/active-event")
  async getUserActiveEvent(context: Context) {
    try {
      const { userId } = context.params as { userId: string };
      const parsedUserId = Number(userId);

      if (isNaN(parsedUserId)) {
        context.status = 400;
        context.body = { error: "Invalid userId" };
        return;
      }

      const eventId = await attendanceManager.getActiveEventIdForUser(parsedUserId);
      if (!eventId) {
        context.status = 404;
        context.body = { error: "No active event found for user" };
        return;
      }

      const event = await attendanceManager.getEventSummary(eventId);
      if (!event) {
        context.status = 404;
        context.body = { error: "Active event not found" };
        return;
      }

      context.body = event;
    } catch (error) {
      console.error("Error getting user active event:", error);
      context.status = 500;
      context.body = { error: "Internal server error" };
    }
  }

  @Put("/api/attendance/users/:userId/active-event")
  async setUserActiveEvent(context: Context) {
    try {
      const { userId } = context.params as { userId: string };
      const { eventId } = context.request.body as { eventId?: number };
      const parsedUserId = Number(userId);

      if (isNaN(parsedUserId) || !eventId) {
        context.status = 400;
        context.body = { error: "Invalid userId or eventId" };
        return;
      }

      await attendanceManager.setActiveEventForUser(parsedUserId, eventId);
      context.status = 204;
    } catch (error) {
      console.error("Error setting user active event:", error);
      context.status = 500;
      context.body = { error: "Internal server error" };
    }
  }
}
