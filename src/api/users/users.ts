import { Post, Router } from "@discordx/koa";
import type { Context } from "koa";
import { AttendanceManager } from "../../managers/attendanceManager.js";

const attendanceManager = new AttendanceManager();

@Router()
export class UserApi {
  @Post("/api/users/discord/:discordId")
  async findOrCreateUser(context: Context) {
    try {
      const { discordId } = context.params as { discordId: string };
      const bodyDiscordId = (context.request.body as { discordId?: string })?.discordId;
      
      // Use discordId from params, fallback to body
      const targetDiscordId = discordId || bodyDiscordId;
      
      if (!targetDiscordId) {
        context.status = 400;
        context.body = { error: "discordId required" };
        return;
      }

      const user = await attendanceManager.findOrCreateUserByDiscordId(targetDiscordId);
      context.body = user;
    } catch (error) {
      console.error("Error finding/creating user:", error);
      context.status = 500;
      context.body = { error: "Internal server error" };
    }
  }
}
