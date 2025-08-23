import { Post, Get, Router } from "@discordx/koa";
import type { Context } from "koa";

/**
 * Unified OAuth API for Discord Activities and External Applications
 * 
 * This API provides token exchange endpoints for:
 * 1. Discord Activities (embedded apps)
 * 2. External web applications 
 * 3. Mobile applications
 * 
 * Supports multiple endpoint paths for maximum compatibility with different frontends.
 */

@Router()
export class UnifiedOAuthAPI {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor() {
    this.clientId = process.env.DISCORD_CLIENT_ID || '';
    this.clientSecret = process.env.DISCORD_CLIENT_SECRET || '';
    this.redirectUri = process.env.DISCORD_REDIRECT_URI || '';

    if (!this.clientId || !this.clientSecret) {
      console.warn('Discord OAuth credentials not configured. Some endpoints may not work.');
    }
  }

  /**
   * Primary token exchange endpoint for Discord Activities
   * POST /api/v1/oauth/token
   */
  @Post("/api/v1/oauth/token")
  async exchangeToken(ctx: Context) {
    return this.handleTokenExchange(ctx);
  }

  /**
   * Alternative auth endpoint
   * POST /api/v1/auth/token
   */
  @Post("/api/v1/auth/token")
  async exchangeAuthToken(ctx: Context) {
    return this.handleTokenExchange(ctx);
  }

  /**
   * Attendance-specific auth endpoint
   * POST /api/v1/attendance/auth/token
   */
  @Post("/api/v1/attendance/auth/token")
  async exchangeAttendanceToken(ctx: Context) {
    return this.handleTokenExchange(ctx);
  }

  /**
   * Legacy endpoint for backward compatibility
   * POST /api/oauth/token
   */
  @Post("/api/oauth/token")
  async exchangeLegacyToken(ctx: Context) {
    return this.handleTokenExchange(ctx);
  }

  /**
   * Discord-specific endpoint for compatibility
   * POST /api/discord/token
   */
  @Post("/api/discord/token")
  async exchangeDiscordToken(ctx: Context) {
    return this.handleTokenExchange(ctx);
  }

  /**
   * Main token exchange handler
   */
  private async handleTokenExchange(ctx: Context) {
    try {
      const body = ctx.request.body as any;
      const { code, client_id } = body;

      // Validation
      if (!code) {
        ctx.status = 400;
        ctx.body = { 
          error: 'Missing authorization code',
          details: 'The "code" parameter is required for token exchange'
        };
        return;
      }

      // Use provided client_id or fallback to environment
      const effectiveClientId = client_id || this.clientId;
      
      if (!effectiveClientId || !this.clientSecret) {
        ctx.status = 500;
        ctx.body = { 
          error: 'OAuth configuration incomplete',
          details: 'Discord client credentials not properly configured'
        };
        return;
      }

      // Calculate redirect URI (Discord Activity format)
      const redirectUri = this.redirectUri || `https://${effectiveClientId}.discordsays.com`;

      console.log(`OAuth Token Exchange: client_id=${effectiveClientId}, redirect_uri=${redirectUri}`);

      // Exchange code for access token with Discord
      const discordResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: effectiveClientId,
          client_secret: this.clientSecret,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri,
        }),
      });

      if (!discordResponse.ok) {
        const errorText = await discordResponse.text();
        console.error('Discord OAuth Error:', errorText);
        
        ctx.status = 400;
        ctx.body = { 
          error: 'Failed to exchange authorization code',
          details: `Discord API returned ${discordResponse.status}: ${errorText}`,
          discord_error: errorText
        };
        return;
      }

      const tokenData = await discordResponse.json();

      // Return the access token in the expected format
      ctx.body = {
        access_token: tokenData.access_token,
        token_type: tokenData.token_type || 'Bearer',
        expires_in: tokenData.expires_in,
        refresh_token: tokenData.refresh_token,
        scope: tokenData.scope
      };

      console.log('OAuth Token Exchange successful');

    } catch (error) {
      console.error('OAuth token exchange error:', error);
      ctx.status = 500;
      ctx.body = { 
        error: 'Internal server error during token exchange',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get current user information using an access token
   * GET /api/v1/oauth/user
   */
  @Get("/api/v1/oauth/user")
  async getCurrentUser(ctx: Context) {
    return this.handleGetCurrentUser(ctx);
  }

  /**
   * Alternative user endpoint
   * GET /api/v1/auth/user
   */
  @Get("/api/v1/auth/user")
  async getAuthUser(ctx: Context) {
    return this.handleGetCurrentUser(ctx);
  }

  /**
   * Discord-specific user endpoint
   * GET /api/discord/user
   */
  @Get("/api/discord/user")
  async getDiscordUser(ctx: Context) {
    return this.handleGetCurrentUser(ctx);
  }

  /**
   * Handle getting current user information
   */
  private async handleGetCurrentUser(ctx: Context) {
    try {
      const authHeader = ctx.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        ctx.status = 401;
        ctx.body = { 
          error: 'Missing or invalid authorization header',
          details: 'Provide Authorization: Bearer <access_token> header'
        };
        return;
      }

      const accessToken = authHeader.substring(7);

      // Get user info from Discord
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!userResponse.ok) {
        const errorText = await userResponse.text();
        ctx.status = 401;
        ctx.body = { 
          error: 'Invalid access token',
          details: `Discord API returned ${userResponse.status}: ${errorText}`
        };
        return;
      }

      const userData = await userResponse.json();
      ctx.body = userData;

    } catch (error) {
      console.error('Error fetching user:', error);
      ctx.status = 500;
      ctx.body = { 
        error: 'Internal server error while fetching user',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Health check endpoint for OAuth service
   * GET /api/v1/oauth/health
   */
  @Get("/api/v1/oauth/health")
  async healthCheck(ctx: Context) {
    const hasCredentials = !!(this.clientId && this.clientSecret);
    
    ctx.body = {
      status: 'ok',
      service: 'oauth',
      configured: hasCredentials,
      endpoints: [
        '/api/v1/oauth/token',
        '/api/v1/auth/token',
        '/api/v1/attendance/auth/token',
        '/api/oauth/token',
        '/api/discord/token'
      ],
      client_id: this.clientId ? 'configured' : 'missing',
      client_secret: this.clientSecret ? 'configured' : 'missing',
      redirect_uri: this.redirectUri || 'auto-generated'
    };
  }

  /**
   * Refresh token endpoint
   * POST /api/v1/oauth/refresh
   */
  @Post("/api/v1/oauth/refresh")
  async refreshToken(ctx: Context) {
    try {
      const body = ctx.request.body as any;
      const { refresh_token } = body;

      if (!refresh_token) {
        ctx.status = 400;
        ctx.body = { 
          error: 'Missing refresh token',
          details: 'The "refresh_token" parameter is required'
        };
        return;
      }

      if (!this.clientId || !this.clientSecret) {
        ctx.status = 500;
        ctx.body = { 
          error: 'OAuth configuration incomplete',
          details: 'Discord client credentials not properly configured'
        };
        return;
      }

      // Refresh the token with Discord
      const discordResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refresh_token,
        }),
      });

      if (!discordResponse.ok) {
        const errorText = await discordResponse.text();
        console.error('Discord refresh token error:', errorText);
        
        ctx.status = 400;
        ctx.body = { 
          error: 'Failed to refresh token',
          details: `Discord API returned ${discordResponse.status}: ${errorText}`
        };
        return;
      }

      const tokenData = await discordResponse.json();

      ctx.body = {
        access_token: tokenData.access_token,
        token_type: tokenData.token_type || 'Bearer',
        expires_in: tokenData.expires_in,
        refresh_token: tokenData.refresh_token,
        scope: tokenData.scope
      };

    } catch (error) {
      console.error('Refresh token error:', error);
      ctx.status = 500;
      ctx.body = { 
        error: 'Internal server error during token refresh',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
