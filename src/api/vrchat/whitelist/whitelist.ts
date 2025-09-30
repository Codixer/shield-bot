import { Get, Post, Delete, Router } from "@discordx/koa";
import { Context } from "koa";
import { WhitelistManager } from "../../../managers/whitelist/whitelistManager.js";
import { prisma } from "../../../main.js";

const whitelistManager = new WhitelistManager();

@Router()
export class WhitelistAPI {
  // Get encoded whitelist (for VRChat clients)
  @Get("/api/vrchat/whitelist/encoded")
  async getEncodedWhitelist(ctx: Context) {
    try {
      const encodedWhitelist =
        await whitelistManager.generateEncodedWhitelist();

      ctx.body = {
        success: true,
        data: encodedWhitelist,
      };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message,
      };
    }
  }

  // Get raw whitelist content
  @Get("/api/vrchat/whitelist/raw")
  async getRawWhitelist(ctx: Context) {
    try {
      const content = await whitelistManager.generateWhitelistContent();

      ctx.body = {
        success: true,
        data: content,
      };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message,
      };
    }
  }

  // Get whitelist statistics
  @Get("/api/vrchat/whitelist/stats")
  async getStatistics(ctx: Context) {
    try {
      const stats = await whitelistManager.getStatistics();

      ctx.body = {
        success: true,
        data: stats,
      };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message,
      };
    }
  }
}
