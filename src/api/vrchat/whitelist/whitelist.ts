import { Get, Post, Delete, Router } from "@discordx/koa";
import { Context } from "koa";
import { WhitelistManager } from "../../../managers/whitelist/whitelistManager.js";
import { prisma } from "../../../main.js";

const whitelistManager = new WhitelistManager();

@Router()
export class WhitelistAPI {
  // Get encoded whitelist (for VRChat clients) - backward compatible endpoint
  @Get("/api/vrchat/whitelist/encoded")
  async getEncodedWhitelistDefault(ctx: Context) {
    try {
      const defaultGuildId = "813926536457224212";
      const encodedWhitelist =
        await whitelistManager.generateEncodedWhitelist(defaultGuildId);

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

  // Get encoded whitelist (for VRChat clients) - guild-specific
  @Get("/api/vrchat/:guildId/whitelist/encoded")
  async getEncodedWhitelist(ctx: Context) {
    try {
      const guildId = ctx.params.guildId;
      const encodedWhitelist =
        await whitelistManager.generateEncodedWhitelist(guildId);

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

  // Get raw whitelist content - backward compatible endpoint
  @Get("/api/vrchat/whitelist/raw")
  async getRawWhitelistDefault(ctx: Context) {
    try {
      const defaultGuildId = "813926536457224212";
      const content = await whitelistManager.generateWhitelistContent(defaultGuildId);

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

  // Get raw whitelist content - guild-specific
  @Get("/api/vrchat/:guildId/whitelist/raw")
  async getRawWhitelist(ctx: Context) {
    try {
      const guildId = ctx.params.guildId;
      const content = await whitelistManager.generateWhitelistContent(guildId);

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

  // Get whitelist statistics - backward compatible endpoint
  @Get("/api/vrchat/whitelist/stats")
  async getStatisticsDefault(ctx: Context) {
    try {
      const defaultGuildId = "813926536457224212";
      const stats = await whitelistManager.getStatistics();

      ctx.body = {
        success: true,
        data: {
          ...stats,
          guildId: defaultGuildId,
        },
      };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message,
      };
    }
  }

  // Get whitelist statistics - guild-specific
  @Get("/api/vrchat/:guildId/whitelist/stats")
  async getStatistics(ctx: Context) {
    try {
      const guildId = ctx.params.guildId;
      const stats = await whitelistManager.getStatistics();

      ctx.body = {
        success: true,
        data: {
          ...stats,
          guildId,
        },
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
