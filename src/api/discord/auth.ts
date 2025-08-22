import { Post, Get, Router } from "@discordx/koa";
import type { Context } from "koa";

@Router()
export class DiscordAuth {
  @Post("/api/discord/token")
  async exchangeToken(context: Context) {
    try {
      const { code } = context.request.body as { code?: string };
      
      if (!code) {
        context.status = 400;
        context.body = { error: "Missing authorization code" };
        return;
      }

      const clientId = process.env.DISCORD_CLIENT_ID;
      const clientSecret = process.env.DISCORD_CLIENT_SECRET;
      const redirectUri = process.env.DISCORD_REDIRECT_URI;

      if (!clientId || !clientSecret || !redirectUri) {
        context.status = 500;
        context.body = { error: "Discord OAuth configuration missing" };
        return;
      }

      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      });

      const response = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        body,
        headers: { 
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        context.status = 400;
        context.body = { 
          error: "OAuth exchange failed", 
          detail: errorText 
        };
        return;
      }

      const tokenData = await response.json();
      context.body = tokenData;
    } catch (error) {
      console.error("Discord OAuth error:", error);
      context.status = 500;
      context.body = { error: "Internal server error" };
    }
  }

  @Get("/api/discord/guild/:guildId/members")
  async getGuildMembers(context: Context) {
    // Placeholder endpoint for guild members
    // In a real implementation, this would integrate with your Discord bot's cached guild members
    context.body = [];
  }
}
