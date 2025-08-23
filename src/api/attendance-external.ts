import { Get, Post, Put, Delete, Router } from "@discordx/koa";
import type { Context } from "koa";
import { AttendanceManager } from "../managers/attendanceManager.js";
import { prisma } from "../main.js";

const attendanceManager = new AttendanceManager();

/**
 * External API for the Attendance System
 * 
 * This API provides external access to the attendance tracking system.
 * All endpoints require proper authentication via Discord OAuth2 or API key.
 * 
 * Authentication Methods:
 * 1. Discord OAuth2: Include `Authorization: Bearer <discord_access_token>` header
 * 2. API Key: Include `X-API-Key: <api_key>` header (for server-to-server communication)
 */

@Router()
export class AttendanceExternalAPI {

  // Authentication & Authorization Middleware
  private async authenticateRequest(ctx: Context): Promise<{ userId: number; discordId: string } | null> {
    const authHeader = ctx.headers.authorization;
    const apiKey = ctx.headers['x-api-key'] as string;

    try {
      // Discord OAuth2 Authentication
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const accessToken = authHeader.substring(7);
        const discordUser = await this.validateDiscordToken(accessToken);
        const user = await attendanceManager.findOrCreateUserByDiscordId(discordUser.id);
        return { userId: user.id, discordId: discordUser.id };
      }

      // API Key Authentication (for server-to-server)
      if (apiKey) {
        // Validate API key against database or environment
        const isValidKey = await this.validateApiKey(apiKey);
        if (!isValidKey) {
          ctx.status = 401;
          ctx.body = { error: 'Invalid API key' };
          return null;
        }
        // For API key auth, we'll need a userId in the request body
        return { userId: 0, discordId: 'system' }; // Special system user
      }

      ctx.status = 401;
      ctx.body = { error: 'Authentication required. Provide either Discord Bearer token or API key.' };
      return null;
    } catch (error) {
      ctx.status = 401;
      ctx.body = { error: 'Invalid authentication credentials' };
      return null;
    }
  }

  private async validateDiscordToken(accessToken: string): Promise<{ id: string; username: string }> {
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      throw new Error('Invalid Discord token');
    }
    
    return response.json();
  }

  private async validateApiKey(apiKey: string): Promise<boolean> {
    // TODO: Implement proper API key validation
    // This could check against a database table or environment variable
    return process.env.ATTENDANCE_API_KEY === apiKey;
  }

  // ========================
  // EVENT MANAGEMENT ENDPOINTS
  // ========================

  /**
   * GET /api/v1/attendance/events
   * 
   * Retrieve all attendance events with optional filtering
   * 
   * Query Parameters:
   * - page?: number (default: 1)
   * - limit?: number (default: 20, max: 100)
   * - startDate?: string (ISO date)
   * - endDate?: string (ISO date)
   * - hostId?: number
   * - includeArchived?: boolean (default: false)
   */
  @Get("/api/v1/attendance/events")
  async getEvents(ctx: Context) {
    const auth = await this.authenticateRequest(ctx);
    if (!auth) return;

    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      hostId,
      includeArchived = false
    } = ctx.query;

    const parsedLimit = Math.min(Number(limit) || 20, 100);
    const parsedPage = Number(page) || 1;
    const offset = (parsedPage - 1) * parsedLimit;

    try {
      const where: any = {};
      
      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = new Date(startDate as string);
        if (endDate) where.date.lte = new Date(endDate as string);
      }
      
      if (hostId) where.hostId = Number(hostId);

      const [events, total] = await Promise.all([
        prisma.attendanceEvent.findMany({
          where,
          include: {
            host: { select: { id: true, discordId: true } },
            cohost: { select: { id: true, discordId: true } },
            _count: {
              select: {
                squads: true,
                staff: true
              }
            }
          },
          orderBy: { date: 'desc' },
          skip: offset,
          take: parsedLimit
        }),
        prisma.attendanceEvent.count({ where })
      ]);

      ctx.body = {
        success: true,
        data: events,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          total,
          totalPages: Math.ceil(total / parsedLimit),
          hasNext: parsedPage < Math.ceil(total / parsedLimit),
          hasPrev: parsedPage > 1
        }
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: 'Failed to retrieve events', details: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * GET /api/v1/attendance/events/:eventId
   * 
   * Get detailed information about a specific event
   */
  @Get("/api/v1/attendance/events/:eventId")
  async getEvent(ctx: Context) {
    const auth = await this.authenticateRequest(ctx);
    if (!auth) return;

    const { eventId } = ctx.params;
    const eventIdNum = parseInt(eventId, 10);

    if (isNaN(eventIdNum)) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid event ID' };
      return;
    }

    try {
      const event = await attendanceManager.getEventSummary(eventIdNum);
      
      if (!event) {
        ctx.status = 404;
        ctx.body = { error: 'Event not found' };
        return;
      }

      ctx.body = {
        success: true,
        data: event
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: 'Failed to retrieve event', details: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * POST /api/v1/attendance/events
   * 
   * Create a new attendance event
   * 
   * Request Body:
   * {
   *   date: string (ISO date),
   *   hostDiscordId?: string,
   *   cohostDiscordId?: string
   * }
   */
  @Post("/api/v1/attendance/events")
  async createEvent(ctx: Context) {
    const auth = await this.authenticateRequest(ctx);
    if (!auth) return;

    const { date, hostDiscordId, cohostDiscordId } = ctx.request.body as any;

    if (!date) {
      ctx.status = 400;
      ctx.body = { error: 'Date is required' };
      return;
    }

    try {
      const eventDate = new Date(date);
      if (isNaN(eventDate.getTime())) {
        ctx.status = 400;
        ctx.body = { error: 'Invalid date format' };
        return;
      }

      let hostId: number | undefined;
      let cohostId: number | undefined;

      if (hostDiscordId) {
        const host = await attendanceManager.findOrCreateUserByDiscordId(hostDiscordId);
        hostId = host.id;
      }

      if (cohostDiscordId) {
        const cohost = await attendanceManager.findOrCreateUserByDiscordId(cohostDiscordId);
        cohostId = cohost.id;
      }

      const event = await attendanceManager.createEvent(eventDate, hostId, cohostId);
      const eventDetails = await attendanceManager.getEventSummary(event.id);

      ctx.status = 201;
      ctx.body = {
        success: true,
        data: eventDetails
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: 'Failed to create event', details: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * PUT /api/v1/attendance/events/:eventId
   * 
   * Update an existing event
   * 
   * Request Body:
   * {
   *   date?: string (ISO date),
   *   hostDiscordId?: string,
   *   cohostDiscordId?: string
   * }
   */
  @Put("/api/v1/attendance/events/:eventId")
  async updateEvent(ctx: Context) {
    const auth = await this.authenticateRequest(ctx);
    if (!auth) return;

    const { eventId } = ctx.params;
    const { date, hostDiscordId, cohostDiscordId } = ctx.request.body as any;
    const eventIdNum = parseInt(eventId, 10);

    if (isNaN(eventIdNum)) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid event ID' };
      return;
    }

    try {
      const updateData: any = {};

      if (date) {
        const eventDate = new Date(date);
        if (isNaN(eventDate.getTime())) {
          ctx.status = 400;
          ctx.body = { error: 'Invalid date format' };
          return;
        }
        updateData.date = eventDate;
      }

      if (hostDiscordId) {
        const host = await attendanceManager.findOrCreateUserByDiscordId(hostDiscordId);
        updateData.hostId = host.id;
      }

      if (cohostDiscordId) {
        const cohost = await attendanceManager.findOrCreateUserByDiscordId(cohostDiscordId);
        updateData.cohostId = cohost.id;
      }

      await prisma.attendanceEvent.update({
        where: { id: eventIdNum },
        data: updateData
      });

      const updatedEvent = await attendanceManager.getEventSummary(eventIdNum);

      ctx.body = {
        success: true,
        data: updatedEvent
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: 'Failed to update event', details: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * DELETE /api/v1/attendance/events/:eventId
   * 
   * Delete an event and all associated data
   */
  @Delete("/api/v1/attendance/events/:eventId")
  async deleteEvent(ctx: Context) {
    const auth = await this.authenticateRequest(ctx);
    if (!auth) return;

    const { eventId } = ctx.params;
    const eventIdNum = parseInt(eventId, 10);

    if (isNaN(eventIdNum)) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid event ID' };
      return;
    }

    try {
      await attendanceManager.deleteEventData(eventIdNum);
      
      ctx.body = {
        success: true,
        message: 'Event deleted successfully'
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: 'Failed to delete event', details: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // ========================
  // SQUAD MANAGEMENT ENDPOINTS
  // ========================

  /**
   * GET /api/v1/attendance/events/:eventId/squads
   * 
   * Get all squads for an event
   */
  @Get("/api/v1/attendance/events/:eventId/squads")
  async getEventSquads(ctx: Context) {
    const auth = await this.authenticateRequest(ctx);
    if (!auth) return;

    const { eventId } = ctx.params;
    const eventIdNum = parseInt(eventId, 10);

    if (isNaN(eventIdNum)) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid event ID' };
      return;
    }

    try {
      const squads = await prisma.squad.findMany({
        where: { eventId: eventIdNum },
        include: {
          members: {
            include: {
              user: { select: { id: true, discordId: true } }
            }
          }
        }
      });

      ctx.body = {
        success: true,
        data: squads
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: 'Failed to retrieve squads', details: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * POST /api/v1/attendance/events/:eventId/squads
   * 
   * Create a new squad for an event
   * 
   * Request Body:
   * {
   *   name: string
   * }
   */
  @Post("/api/v1/attendance/events/:eventId/squads")
  async createSquad(ctx: Context) {
    const auth = await this.authenticateRequest(ctx);
    if (!auth) return;

    const { eventId } = ctx.params;
    const { name } = ctx.request.body as any;
    const eventIdNum = parseInt(eventId, 10);

    if (isNaN(eventIdNum)) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid event ID' };
      return;
    }

    if (!name || !name.trim()) {
      ctx.status = 400;
      ctx.body = { error: 'Squad name is required' };
      return;
    }

    try {
      // Check if event exists
      const event = await prisma.attendanceEvent.findUnique({
        where: { id: eventIdNum }
      });

      if (!event) {
        ctx.status = 404;
        ctx.body = { error: 'Event not found' };
        return;
      }

      // Check if squad with this name already exists for this event
      const existingSquad = await prisma.squad.findFirst({
        where: {
          eventId: eventIdNum,
          name: name.trim()
        }
      });

      if (existingSquad) {
        ctx.status = 409;
        ctx.body = { error: 'Squad with this name already exists for this event' };
        return;
      }

      // Create the squad
      const squad = await prisma.squad.create({
        data: {
          eventId: eventIdNum,
          name: name.trim()
        },
        include: {
          members: {
            include: {
              user: { select: { id: true, discordId: true } }
            }
          }
        }
      });

      ctx.status = 201;
      ctx.body = {
        success: true,
        data: squad
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: 'Failed to create squad', details: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * POST /api/v1/attendance/events/:eventId/squads/:squadName/members
   * 
   * Add a member to a squad
   * 
   * Request Body:
   * {
   *   discordId: string,
   *   isLead?: boolean,
   *   isLate?: boolean,
   *   lateNote?: string
   * }
   */
  @Post("/api/v1/attendance/events/:eventId/squads/:squadName/members")
  async addSquadMember(ctx: Context) {
    const auth = await this.authenticateRequest(ctx);
    if (!auth) return;

    const { eventId, squadName } = ctx.params;
    const { discordId, isLead = false, isLate = false, lateNote } = ctx.request.body as any;
    const eventIdNum = parseInt(eventId, 10);

    if (isNaN(eventIdNum) || !discordId || !squadName.trim()) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid eventId, squadName, or discordId' };
      return;
    }

    try {
      const user = await attendanceManager.findOrCreateUserByDiscordId(discordId);
      const member = await attendanceManager.addUserToSquad(eventIdNum, user.id, squadName.trim());

      // Update member attributes if provided
      if (isLead || isLate || lateNote) {
        await prisma.squadMember.update({
          where: { id: member.id },
          data: {
            isLead: isLead || false,
            isLate: isLate || false,
            lateNote: lateNote || null
          }
        });
      }

      const updatedMember = await prisma.squadMember.findUnique({
        where: { id: member.id },
        include: {
          user: { select: { id: true, discordId: true } },
          squad: true
        }
      });

      ctx.status = 201;
      ctx.body = {
        success: true,
        data: updatedMember
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: 'Failed to add squad member', details: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * PUT /api/v1/attendance/events/:eventId/members/:discordId/squad
   * 
   * Move a member to a different squad
   * 
   * Request Body:
   * {
   *   squadName: string,
   *   isSplit?: boolean,
   *   splitFrom?: string
   * }
   */
  @Put("/api/v1/attendance/events/:eventId/members/:discordId/squad")
  async moveMemberToSquad(ctx: Context) {
    const auth = await this.authenticateRequest(ctx);
    if (!auth) return;

    const { eventId, discordId } = ctx.params;
    const { squadName, isSplit = false, splitFrom } = ctx.request.body as any;
    const eventIdNum = parseInt(eventId, 10);

    if (isNaN(eventIdNum) || !discordId || !squadName) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid eventId, discordId, or squadName' };
      return;
    }

    try {
      const user = await attendanceManager.findOrCreateUserByDiscordId(discordId);
      
      if (isSplit && splitFrom) {
        await attendanceManager.markUserAsSplit(eventIdNum, user.id, squadName, splitFrom);
      } else {
        await attendanceManager.moveUserToSquad(eventIdNum, user.id, squadName);
      }

      const updatedEvent = await attendanceManager.getEventSummary(eventIdNum);

      ctx.body = {
        success: true,
        data: updatedEvent
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: 'Failed to move member', details: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * PUT /api/v1/attendance/events/:eventId/members/:discordId/status
   * 
   * Update member status (lead, late, etc.)
   * 
   * Request Body:
   * {
   *   isLead?: boolean,
   *   isLate?: boolean,
   *   lateNote?: string
   * }
   */
  @Put("/api/v1/attendance/events/:eventId/members/:discordId/status")
  async updateMemberStatus(ctx: Context) {
    const auth = await this.authenticateRequest(ctx);
    if (!auth) return;

    const { eventId, discordId } = ctx.params;
    const { isLead, isLate, lateNote } = ctx.request.body as any;
    const eventIdNum = parseInt(eventId, 10);

    if (isNaN(eventIdNum) || !discordId) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid eventId or discordId' };
      return;
    }

    try {
      const user = await attendanceManager.findOrCreateUserByDiscordId(discordId);

      if (isLead !== undefined) {
        await attendanceManager.markUserAsLead(eventIdNum, user.id);
      }

      if (isLate !== undefined || lateNote !== undefined) {
        await attendanceManager.markUserAsLate(eventIdNum, user.id, lateNote);
      }

      const updatedEvent = await attendanceManager.getEventSummary(eventIdNum);

      ctx.body = {
        success: true,
        data: updatedEvent
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: 'Failed to update member status', details: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * DELETE /api/v1/attendance/events/:eventId/members/:discordId
   * 
   * Remove a member from the event
   */
  @Delete("/api/v1/attendance/events/:eventId/members/:discordId")
  async removeMember(ctx: Context) {
    const auth = await this.authenticateRequest(ctx);
    if (!auth) return;

    const { eventId, discordId } = ctx.params;
    const eventIdNum = parseInt(eventId, 10);

    if (isNaN(eventIdNum) || !discordId) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid eventId or discordId' };
      return;
    }

    try {
      const user = await attendanceManager.findOrCreateUserByDiscordId(discordId);
      await attendanceManager.removeUserFromEvent(eventIdNum, user.id);

      ctx.body = {
        success: true,
        message: 'Member removed successfully'
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: 'Failed to remove member', details: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // ========================
  // STAFF MANAGEMENT ENDPOINTS
  // ========================

  /**
   * POST /api/v1/attendance/events/:eventId/staff
   * 
   * Add staff to an event
   * 
   * Request Body:
   * {
   *   discordId: string
   * }
   */
  @Post("/api/v1/attendance/events/:eventId/staff")
  async addStaff(ctx: Context) {
    const auth = await this.authenticateRequest(ctx);
    if (!auth) return;

    const { eventId } = ctx.params;
    const { discordId } = ctx.request.body as any;
    const eventIdNum = parseInt(eventId, 10);

    if (isNaN(eventIdNum) || !discordId) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid eventId or discordId' };
      return;
    }

    try {
      const user = await attendanceManager.findOrCreateUserByDiscordId(discordId);
      const staff = await attendanceManager.addStaff(eventIdNum, user.id);

      ctx.status = 201;
      ctx.body = {
        success: true,
        data: staff
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: 'Failed to add staff', details: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * PUT /api/v1/attendance/events/:eventId/cohost
   * 
   * Set event cohost
   * 
   * Request Body:
   * {
   *   discordId: string
   * }
   */
  @Put("/api/v1/attendance/events/:eventId/cohost")
  async setCohost(ctx: Context) {
    const auth = await this.authenticateRequest(ctx);
    if (!auth) return;

    const { eventId } = ctx.params;
    const { discordId } = ctx.request.body as any;
    const eventIdNum = parseInt(eventId, 10);

    if (isNaN(eventIdNum) || !discordId) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid eventId or discordId' };
      return;
    }

    try {
      const user = await attendanceManager.findOrCreateUserByDiscordId(discordId);
      await attendanceManager.setCohost(eventIdNum, user.id);

      const updatedEvent = await attendanceManager.getEventSummary(eventIdNum);

      ctx.body = {
        success: true,
        data: updatedEvent
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: 'Failed to set cohost', details: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // ========================
  // USER MANAGEMENT ENDPOINTS
  // ========================

  /**
   * GET /api/v1/attendance/users/:discordId/active-event
   * 
   * Get user's active event
   */
  @Get("/api/v1/attendance/users/:discordId/active-event")
  async getUserActiveEvent(ctx: Context) {
    const auth = await this.authenticateRequest(ctx);
    if (!auth) return;

    const { discordId } = ctx.params;

    try {
      const user = await attendanceManager.findOrCreateUserByDiscordId(discordId);
      const eventId = await attendanceManager.getActiveEventIdForUser(user.id);

      if (!eventId) {
        ctx.status = 404;
        ctx.body = { error: 'No active event found' };
        return;
      }

      const event = await attendanceManager.getEventSummary(eventId);

      ctx.body = {
        success: true,
        data: {
          eventId,
          event
        }
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: 'Failed to get active event', details: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * PUT /api/v1/attendance/users/:discordId/active-event
   * 
   * Set user's active event
   * 
   * Request Body:
   * {
   *   eventId: number
   * }
   */
  @Put("/api/v1/attendance/users/:discordId/active-event")
  async setUserActiveEvent(ctx: Context) {
    const auth = await this.authenticateRequest(ctx);
    if (!auth) return;

    const { discordId } = ctx.params;
    const { eventId } = ctx.request.body as any;

    if (!eventId || isNaN(Number(eventId))) {
      ctx.status = 400;
      ctx.body = { error: 'Valid eventId is required' };
      return;
    }

    try {
      const user = await attendanceManager.findOrCreateUserByDiscordId(discordId);
      await attendanceManager.setActiveEventForUser(user.id, Number(eventId));

      ctx.body = {
        success: true,
        message: 'Active event set successfully'
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: 'Failed to set active event', details: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * DELETE /api/v1/attendance/users/:discordId/active-event
   * 
   * Clear user's active event
   */
  @Delete("/api/v1/attendance/users/:discordId/active-event")
  async clearUserActiveEvent(ctx: Context) {
    const auth = await this.authenticateRequest(ctx);
    if (!auth) return;

    const { discordId } = ctx.params;

    try {
      const user = await attendanceManager.findOrCreateUserByDiscordId(discordId);
      await attendanceManager.clearActiveEventForUser(user.id);

      ctx.body = {
        success: true,
        message: 'Active event cleared successfully'
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: 'Failed to clear active event', details: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // ========================
  // UTILITY ENDPOINTS
  // ========================

  /**
   * GET /api/v1/attendance/squads/templates
   * 
   * Get available squad templates/mappings
   */
  @Get("/api/v1/attendance/squads/templates")
  async getSquadTemplates(ctx: Context) {
    const auth = await this.authenticateRequest(ctx);
    if (!auth) return;

    // Squad mapping for display names and numbers
    const SQUAD_MAP = {
      "814239808675119144": { name: "Adam", number: "02" },
      "814239954641223760": { name: "Baker", number: "16" },
      "814240045405569038": { name: "Coffee", number: "24" },
      "814240176317923391": { name: "Delta", number: "08" },
      "814240290494742732": { name: "Eagle", number: "10" },
      "814240677004836925": { name: "Fitness", number: "34" },
      "814241070110998558": { name: "Gamma", number: "05" },
      "1012880059415150642": { name: "MAG", number: "30" },
      "814932938961190953": { name: "EMT" },
      "814933108658274365": { name: "TRU" }
    };

    ctx.body = {
      success: true,
      data: Object.entries(SQUAD_MAP).map(([id, info]) => ({
        id,
        name: info.name,
        number: (info as any).number || null
      }))
    };
  }

  /**
   * GET /api/v1/attendance/stats/:eventId
   * 
   * Get attendance statistics for an event
   */
  @Get("/api/v1/attendance/stats/:eventId")
  async getEventStats(ctx: Context) {
    const auth = await this.authenticateRequest(ctx);
    if (!auth) return;

    const { eventId } = ctx.params;
    const eventIdNum = parseInt(eventId, 10);

    if (isNaN(eventIdNum)) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid event ID' };
      return;
    }

    try {
      const event = await prisma.attendanceEvent.findUnique({
        where: { id: eventIdNum },
        include: {
          squads: {
            include: {
              members: true
            }
          },
          staff: true
        }
      });

      if (!event) {
        ctx.status = 404;
        ctx.body = { error: 'Event not found' };
        return;
      }

      const totalMembers = event.squads.reduce((sum, squad) => sum + squad.members.length, 0);
      const totalLateMembers = event.squads.reduce((sum, squad) => 
        sum + squad.members.filter(m => m.isLate).length, 0
      );
      const totalLeads = event.squads.reduce((sum, squad) => 
        sum + squad.members.filter(m => m.isLead).length, 0
      );
      const totalSplits = event.squads.reduce((sum, squad) => 
        sum + squad.members.filter(m => m.isSplit).length, 0
      );

      const stats = {
        eventId: eventIdNum,
        totalSquads: event.squads.length,
        totalMembers,
        totalStaff: event.staff.length,
        totalLateMembers,
        totalLeads,
        totalSplits,
        squadBreakdown: event.squads.map(squad => ({
          squadName: squad.name,
          memberCount: squad.members.length,
          leadCount: squad.members.filter(m => m.isLead).length,
          lateCount: squad.members.filter(m => m.isLate).length,
          splitCount: squad.members.filter(m => m.isSplit).length
        }))
      };

      ctx.body = {
        success: true,
        data: stats
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: 'Failed to get event stats', details: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
