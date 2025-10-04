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
      const encodedWhitelist = await whitelistManager.generateEncodedWhitelist(guildId);
      const etag = require("crypto").createHash("sha256").update(encodedWhitelist).digest("hex");
      const lastModified = whitelistManager.lastUpdateTimestamp
        ? new Date(whitelistManager.lastUpdateTimestamp).toUTCString()
        : undefined;

      if (
        ctx.headers["if-none-match"] === etag ||
        (lastModified && ctx.headers["if-modified-since"] === lastModified)
      ) {
        ctx.status = 304;
        return;
      }
      ctx.set("Cache-Control", "public, max-age=3600");
      ctx.set("ETag", etag);
      if (lastModified) ctx.set("Last-Modified", lastModified);
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
      const etag = require("crypto").createHash("sha256").update(content).digest("hex");
      const lastModified = whitelistManager.lastUpdateTimestamp
        ? new Date(whitelistManager.lastUpdateTimestamp).toUTCString()
        : undefined;

      if (
        ctx.headers["if-none-match"] === etag ||
        (lastModified && ctx.headers["if-modified-since"] === lastModified)
      ) {
        ctx.status = 304;
        return;
      }
      ctx.set("Cache-Control", "public, max-age=3600");
      ctx.set("ETag", etag);
      if (lastModified) ctx.set("Last-Modified", lastModified);
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
