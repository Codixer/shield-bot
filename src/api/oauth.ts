import { Post, Router } from "@discordx/koa";
import type { Context } from "koa";

@Router()
export class OAuthAPI {
  @Post("/api/oauth/token")
  async exchangeCode(ctx: Context) {
    const { code } = ctx.request.body as { code: string };
    
    if (!code) {
      ctx.status = 400;
      ctx.body = { error: 'code is required' };
      return;
    }

    try {
      const clientId = process.env.DISCORD_CLIENT_ID || '1234567890123456789';
      const clientSecret = process.env.DISCORD_CLIENT_SECRET || 'your_client_secret';
      const redirectUri = `https://${clientId}.discordsays.com`;

      const response = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri,
        }).toString(),
      });

      if (!response.ok) {
        throw new Error(`Discord API error: ${response.status}`);
      }

      const tokenData = await response.json();
      ctx.body = tokenData;
    } catch (error: any) {
      console.error('OAuth token exchange error:', error);
      ctx.status = 500;
      ctx.body = { error: 'Failed to exchange authorization code' };
    }
  }
}