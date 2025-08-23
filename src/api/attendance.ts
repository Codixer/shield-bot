import { Get, Post, Router } from "@discordx/koa";
import type { Context } from "koa";
import { AttendanceManager } from "../managers/attendanceManager.js";

const attendanceManager = new AttendanceManager();

// Squad mapping for display names and numbers
const SQUAD_MAP: Record<string, { name: string, number?: string }> = {
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

@Router()
export class AttendanceAPI {

  // Middleware to validate Discord token and extract user info
  private async validateRequest(ctx: Context) {
    const authHeader = ctx.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      ctx.status = 401;
      ctx.body = { error: 'Missing or invalid authorization header' };
      return null;
    }

    const accessToken = authHeader.substring(7);
    
    try {
      const discordUser = await attendanceManager.validateDiscordToken(accessToken);
      return { discordUserId: discordUser.id, discordUser };
    } catch (error: any) {
      ctx.status = 401;
      ctx.body = { error: 'Invalid Discord access token' };
      return null;
    }
  }

  @Post("/api/attendance/create")
  async createEvent(ctx: Context) {
    const validation = await this.validateRequest(ctx);
    if (!validation) return;

    const { discordInstanceId } = ctx.request.body as { discordInstanceId: string };
    
    if (!discordInstanceId) {
      ctx.status = 400;
      ctx.body = { error: 'discordInstanceId is required' };
      return;
    }

    try {
      // Check if event already exists for this instance
      const existingEvent = await attendanceManager.getActiveEventByInstanceId(discordInstanceId);
      if (existingEvent) {
        ctx.body = { 
          success: true, 
          event: existingEvent, 
          message: 'Event already exists for this activity instance' 
        };
        return;
      }

      const event = await attendanceManager.createActivityEvent(discordInstanceId, validation.discordUserId);
      ctx.body = { success: true, event };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  }

  @Post("/api/attendance/add-member")
  async addMember(ctx: Context) {
    const validation = await this.validateRequest(ctx);
    if (!validation) return;

    const { discordInstanceId, targetUserId, squad } = ctx.request.body as {
      discordInstanceId: string;
      targetUserId: string;
      squad: string;
    };

    if (!discordInstanceId || !targetUserId || !squad) {
      ctx.status = 400;
      ctx.body = { error: 'discordInstanceId, targetUserId, and squad are required' };
      return;
    }

    try {
      await attendanceManager.addUserToSquadByInstance(discordInstanceId, targetUserId, squad);
      ctx.body = { success: true, message: `Added user to ${SQUAD_MAP[squad]?.name || squad}` };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  }

  @Post("/api/attendance/remove-member")
  async removeMember(ctx: Context) {
    const validation = await this.validateRequest(ctx);
    if (!validation) return;

    const { discordInstanceId, targetUserId } = ctx.request.body as {
      discordInstanceId: string;
      targetUserId: string;
    };

    if (!discordInstanceId || !targetUserId) {
      ctx.status = 400;
      ctx.body = { error: 'discordInstanceId and targetUserId are required' };
      return;
    }

    try {
      await attendanceManager.removeUserFromEventByInstance(discordInstanceId, targetUserId);
      ctx.body = { success: true, message: 'Removed user from event' };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  }

  @Post("/api/attendance/move-member")
  async moveMember(ctx: Context) {
    const validation = await this.validateRequest(ctx);
    if (!validation) return;

    const { discordInstanceId, targetUserId, squad } = ctx.request.body as {
      discordInstanceId: string;
      targetUserId: string;
      squad: string;
    };

    if (!discordInstanceId || !targetUserId || !squad) {
      ctx.status = 400;
      ctx.body = { error: 'discordInstanceId, targetUserId, and squad are required' };
      return;
    }

    try {
      await attendanceManager.moveUserToSquadByInstance(discordInstanceId, targetUserId, squad);
      ctx.body = { success: true, message: `Moved user to ${SQUAD_MAP[squad]?.name || squad}` };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  }

  @Post("/api/attendance/mark-lead")
  async markLead(ctx: Context) {
    const validation = await this.validateRequest(ctx);
    if (!validation) return;

    const { discordInstanceId, targetUserId } = ctx.request.body as {
      discordInstanceId: string;
      targetUserId: string;
    };

    if (!discordInstanceId || !targetUserId) {
      ctx.status = 400;
      ctx.body = { error: 'discordInstanceId and targetUserId are required' };
      return;
    }

    try {
      await attendanceManager.markUserAsLeadByInstance(discordInstanceId, targetUserId);
      ctx.body = { success: true, message: 'Marked user as lead' };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  }

  @Post("/api/attendance/mark-late")
  async markLate(ctx: Context) {
    const validation = await this.validateRequest(ctx);
    if (!validation) return;

    const { discordInstanceId, targetUserId, note } = ctx.request.body as {
      discordInstanceId: string;
      targetUserId: string;
      note?: string;
    };

    if (!discordInstanceId || !targetUserId) {
      ctx.status = 400;
      ctx.body = { error: 'discordInstanceId and targetUserId are required' };
      return;
    }

    try {
      await attendanceManager.markUserAsLateByInstance(discordInstanceId, targetUserId, note);
      ctx.body = { success: true, message: `Marked user as late${note ? ` (${note})` : ''}` };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  }

  @Post("/api/attendance/split-member")
  async splitMember(ctx: Context) {
    const validation = await this.validateRequest(ctx);
    if (!validation) return;

    const { discordInstanceId, targetUserId, squad, splitFrom } = ctx.request.body as {
      discordInstanceId: string;
      targetUserId: string;
      squad: string;
      splitFrom?: string;
    };

    if (!discordInstanceId || !targetUserId || !squad) {
      ctx.status = 400;
      ctx.body = { error: 'discordInstanceId, targetUserId, and squad are required' };
      return;
    }

    try {
      const previousSquadName = splitFrom || "Unknown";
      await attendanceManager.markUserAsSplitByInstance(discordInstanceId, targetUserId, squad, previousSquadName);
      ctx.body = { success: true, message: `Split user to ${SQUAD_MAP[squad]?.name || squad} (Split from ${previousSquadName})` };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  }

  @Post("/api/attendance/add-staff")
  async addStaff(ctx: Context) {
    const validation = await this.validateRequest(ctx);
    if (!validation) return;

    const { discordInstanceId, targetUserId } = ctx.request.body as {
      discordInstanceId: string;
      targetUserId: string;
    };

    if (!discordInstanceId || !targetUserId) {
      ctx.status = 400;
      ctx.body = { error: 'discordInstanceId and targetUserId are required' };
      return;
    }

    try {
      await attendanceManager.addStaffByInstance(discordInstanceId, targetUserId);
      ctx.body = { success: true, message: 'Added user as staff' };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  }

  @Post("/api/attendance/set-cohost")
  async setCohost(ctx: Context) {
    const validation = await this.validateRequest(ctx);
    if (!validation) return;

    const { discordInstanceId, targetUserId } = ctx.request.body as {
      discordInstanceId: string;
      targetUserId: string;
    };

    if (!discordInstanceId || !targetUserId) {
      ctx.status = 400;
      ctx.body = { error: 'discordInstanceId and targetUserId are required' };
      return;
    }

    try {
      await attendanceManager.setCohostByInstance(discordInstanceId, targetUserId);
      ctx.body = { success: true, message: 'Set user as cohost' };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  }

  @Get("/api/attendance/summary")
  async getSummary(ctx: Context) {
    const validation = await this.validateRequest(ctx);
    if (!validation) return;

    const { discordInstanceId } = ctx.query as { discordInstanceId: string };

    if (!discordInstanceId) {
      ctx.status = 400;
      ctx.body = { error: 'discordInstanceId query parameter is required' };
      return;
    }

    try {
      const summary = await attendanceManager.getEventSummaryByInstance(discordInstanceId);
      if (!summary) {
        ctx.status = 404;
        ctx.body = { error: 'No event found for this activity instance' };
        return;
      }

      ctx.body = { success: true, summary };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  }

  @Get("/api/attendance/formatted-summary")
  async getFormattedSummary(ctx: Context) {
    const validation = await this.validateRequest(ctx);
    if (!validation) return;

    const { discordInstanceId } = ctx.query as { discordInstanceId: string };

    if (!discordInstanceId) {
      ctx.status = 400;
      ctx.body = { error: 'discordInstanceId query parameter is required' };
      return;
    }

    try {
      const summary = await attendanceManager.getEventSummaryByInstance(discordInstanceId);
      if (!summary) {
        ctx.status = 404;
        ctx.body = { error: 'No event found for this activity instance' };
        return;
      }

      const today = new Date();
      let text = `Attendance for ${today.toLocaleString('en-US', { month: 'long', day: 'numeric' })}\n\n`;
      text += `Host: ${summary?.host ? `<@${summary.host.discordId}>` : 'None'}\n`;
      text += `Co-Host: ${summary?.cohost ? `<@${summary.cohost.discordId}>` : 'None'}\n`;
      text += `Attending Staff: ${summary?.staff?.map((s: any) => `<@${s.user.discordId}>`).join(' ') || 'None'} \n\n`;

      for (const squad of summary?.squads || []) {
        const squadInfo = SQUAD_MAP[squad.name] || { name: squad.name };
        let squadLine = squadInfo.name;
        if (squadInfo.number) squadLine += ` - ${squadInfo.number}`;
        text += `${squadLine}\n`;
        
        for (const member of squad.members) {
          let line = `<@${member.user.discordId}>`;
          if (member.isLead) line += ' (Lead)';
          if (member.isSplit && member.splitFrom) line += ` (Split from ${member.splitFrom})`;
          if (member.isLate && member.lateNote) line += ` (Joined ${member.lateNote})`;
          text += line + '\n';
        }
        text += '\n';
      }

      ctx.body = { success: true, formattedText: text };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  }

  @Get("/api/attendance/squads")
  async getSquads(ctx: Context) {
    ctx.body = { 
      success: true, 
      squads: Object.entries(SQUAD_MAP).map(([id, info]) => ({
        id,
        name: info.name,
        number: info.number
      }))
    };
  }
}