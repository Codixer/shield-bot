import { Get, Router } from "@discordx/koa";
import { Context } from "koa";
import { WhitelistManager } from "../../../managers/whitelist/whitelistManager.js";
import crypto from "crypto";

const whitelistManager = new WhitelistManager();

@Router()
export class WhitelistAPI {
  // Get encoded whitelist (for VRChat clients) - guild-specific
  @Get("/api/vrchat/:guildId/whitelist/encoded")
  async getEncodedWhitelist(ctx: Context) {
    try {
      const guildId = ctx.params.guildId;
      const encodedWhitelist = await whitelistManager.generateEncodedWhitelist(guildId);
      const etag = crypto.createHash("sha256").update(encodedWhitelist).digest("hex");
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
      ctx.set("Cache-Control", "public, max-age=86400");
      ctx.set("ETag", etag);
      if (lastModified) {ctx.set("Last-Modified", lastModified);}
      ctx.body = {
        success: true,
        data: encodedWhitelist,
      };
    } catch (error: unknown) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  // Get raw whitelist content - guild-specific
  @Get("/api/vrchat/:guildId/whitelist/raw")
  async getRawWhitelist(ctx: Context) {
    try {
      const guildId = ctx.params.guildId;
      const content = await whitelistManager.generateWhitelistContent(guildId);
      const etag = crypto.createHash("sha256").update(content).digest("hex");
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
      ctx.set("Cache-Control", "public, max-age=86400");
      ctx.set("ETag", etag);
      if (lastModified) {ctx.set("Last-Modified", lastModified);}
      ctx.body = {
        success: true,
        data: content,
      };
    } catch (error: unknown) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  // Get whitelist statistics - guild-specific
  @Get("/api/vrchat/:guildId/whitelist/stats")
  async getStatistics(ctx: Context) {
    try {
      const guildId = ctx.params.guildId;
      const stats = await whitelistManager.getStatistics(guildId);

      ctx.body = {
        success: true,
        data: {
          ...stats,
          guildId,
        },
      };
    } catch (error: unknown) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }
}
