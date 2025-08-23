/**
 * Example Frontend Integration for Shield Bot Attendance API
 * This file demonstrates how to integrate the attendance system into a web frontend
 */

import type {
  APIResponse,
  AttendanceEvent,
  CreateEventRequest,
  AddSquadMemberRequest,
  EventStatistics,
  SquadTemplate
} from './types/attendance-external.js';

export class AttendanceAPIClient {
  private baseUrl: string;
  private discordToken: string;

  constructor(baseUrl: string, discordToken: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.discordToken = discordToken;
  }

  /**
   * Update the Discord token for this client instance
   */
  setDiscordToken(token: string) {
    this.discordToken = token;
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<APIResponse<T>> {
    const url = `${this.baseUrl}/api/v1/attendance${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.discordToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new AttendanceAPIError(
        data.error || 'API request failed',
        response.status,
        data.details
      );
    }

    return data;
  }

  // ========================
  // EVENT MANAGEMENT
  // ========================

  async getEvents(params?: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    hostId?: number;
    includeArchived?: boolean;
  }) {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          query.append(key, value.toString());
        }
      });
    }

    const endpoint = `/events${query.toString() ? `?${query.toString()}` : ''}`;
    return this.request<AttendanceEvent[]>(endpoint);
  }

  async getEvent(eventId: number) {
    return this.request<AttendanceEvent>(`/events/${eventId}`);
  }

  async createEvent(data: CreateEventRequest) {
    return this.request<AttendanceEvent>('/events', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEvent(eventId: number, data: Partial<CreateEventRequest>) {
    return this.request<AttendanceEvent>(`/events/${eventId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteEvent(eventId: number) {
    return this.request(`/events/${eventId}`, {
      method: 'DELETE',
    });
  }

  // ========================
  // SQUAD MANAGEMENT
  // ========================

  async getEventSquads(eventId: number) {
    return this.request(`/events/${eventId}/squads`);
  }

  async addSquadMember(eventId: number, squadName: string, data: AddSquadMemberRequest) {
    return this.request(`/events/${eventId}/squads/${encodeURIComponent(squadName)}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async moveMemberToSquad(eventId: number, discordId: string, data: {
    squadName: string;
    isSplit?: boolean;
    splitFrom?: string;
  }) {
    return this.request(`/events/${eventId}/members/${discordId}/squad`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async updateMemberStatus(eventId: number, discordId: string, data: {
    isLead?: boolean;
    isLate?: boolean;
    lateNote?: string;
  }) {
    return this.request(`/events/${eventId}/members/${discordId}/status`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async removeMember(eventId: number, discordId: string) {
    return this.request(`/events/${eventId}/members/${discordId}`, {
      method: 'DELETE',
    });
  }

  // ========================
  // STAFF MANAGEMENT
  // ========================

  async addStaff(eventId: number, discordId: string) {
    return this.request(`/events/${eventId}/staff`, {
      method: 'POST',
      body: JSON.stringify({ discordId }),
    });
  }

  async setCohost(eventId: number, discordId: string) {
    return this.request(`/events/${eventId}/cohost`, {
      method: 'PUT',
      body: JSON.stringify({ discordId }),
    });
  }

  // ========================
  // USER MANAGEMENT
  // ========================

  async getUserActiveEvent(discordId: string) {
    return this.request(`/users/${discordId}/active-event`);
  }

  async setUserActiveEvent(discordId: string, eventId: number) {
    return this.request(`/users/${discordId}/active-event`, {
      method: 'PUT',
      body: JSON.stringify({ eventId }),
    });
  }

  async clearUserActiveEvent(discordId: string) {
    return this.request(`/users/${discordId}/active-event`, {
      method: 'DELETE',
    });
  }

  // ========================
  // UTILITIES
  // ========================

  async getSquadTemplates() {
    return this.request<SquadTemplate[]>('/squads/templates');
  }

  async getEventStats(eventId: number) {
    return this.request<EventStatistics>(`/stats/${eventId}`);
  }
}

export class AttendanceAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public details?: string
  ) {
    super(message);
    this.name = 'AttendanceAPIError';
  }
}

// ========================
// DISCORD AUTHENTICATION HELPER
// ========================

export interface TokenExchangeResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface DiscordUserInfo {
  id: string;
  username: string;
  discriminator?: string;
  avatar?: string;
  global_name?: string;
}

export class DiscordAuthHelper {
  private baseUrl: string;
  private clientId: string;

  constructor(baseUrl: string, clientId: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.clientId = clientId;
  }

  /**
   * Exchange Discord authorization code for access token
   * Tries multiple endpoint paths for maximum compatibility
   */
  async exchangeCodeForToken(code: string): Promise<TokenExchangeResponse> {
    const endpoints = [
      '/api/v1/oauth/token',
      '/api/v1/auth/token', 
      '/api/v1/attendance/auth/token',
      '/api/oauth/token',
      '/api/discord/token'
    ];

    const requestBody = {
      code: code,
      client_id: this.clientId
    };

    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      try {
        console.log(`Attempting token exchange at: ${endpoint}`);
        
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        const data = await response.json();

        if (response.ok && data.access_token) {
          console.log(`Token exchange successful at: ${endpoint}`);
          return data;
        }

        console.warn(`Token exchange failed at ${endpoint}:`, data);
        lastError = new Error(data.error || `HTTP ${response.status}`);

      } catch (error) {
        console.warn(`Token exchange error at ${endpoint}:`, error);
        lastError = error instanceof Error ? error : new Error('Unknown error');
      }
    }

    throw new AttendanceAPIError(
      'Failed to exchange authorization code for token at all endpoints',
      401,
      lastError?.message
    );
  }

  /**
   * Get current Discord user information
   */
  async getCurrentUser(accessToken: string): Promise<DiscordUserInfo> {
    const endpoints = [
      '/api/v1/oauth/user',
      '/api/v1/auth/user',
      '/api/discord/user'
    ];

    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (response.ok) {
          const userData = await response.json();
          return userData;
        }

        const errorData = await response.json();
        lastError = new Error(errorData.error || `HTTP ${response.status}`);

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
      }
    }

    throw new AttendanceAPIError(
      'Failed to get user information',
      401,
      lastError?.message
    );
  }

  /**
   * Refresh an expired access token
   */
  async refreshToken(refreshToken: string): Promise<TokenExchangeResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/oauth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new AttendanceAPIError(
          data.error || 'Failed to refresh token',
          response.status,
          data.details
        );
      }

      return data;
    } catch (error) {
      if (error instanceof AttendanceAPIError) {
        throw error;
      }
      throw new AttendanceAPIError(
        'Token refresh failed',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
}

// ========================
// COMPLETE AUTHENTICATION WORKFLOW
// ========================

export class DiscordAuthWorkflow {
  private authHelper: DiscordAuthHelper;
  private clientId: string;
  private baseUrl: string;

  constructor(baseUrl: string, clientId: string) {
    this.baseUrl = baseUrl;
    this.clientId = clientId;
    this.authHelper = new DiscordAuthHelper(baseUrl, clientId);
  }

  /**
   * Complete authentication workflow for Discord Activities
   * This handles the full flow from SDK authorization to API client creation
   */
  async authenticateDiscordActivity(discordSdk: any): Promise<{
    client: AttendanceAPIClient;
    user: DiscordUserInfo;
    tokens: TokenExchangeResponse;
  }> {
    try {
      // Step 1: Get authorization code from Discord SDK
      console.log('Starting Discord Activity authentication...');
      
      const { code } = await discordSdk.commands.authorize({
        client_id: this.clientId,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify', 'guilds.members.read'],
      });

      console.log('Received authorization code from Discord');

      // Step 2: Exchange code for access token
      const tokens = await this.authHelper.exchangeCodeForToken(code);
      console.log('Successfully exchanged code for access token');

      // Step 3: Get user information
      const user = await this.authHelper.getCurrentUser(tokens.access_token);
      console.log('Retrieved user information:', user.username);

      // Step 4: Create API client
      const client = new AttendanceAPIClient(this.baseUrl, tokens.access_token);

      return { client, user, tokens };

    } catch (error) {
      console.error('Discord Activity authentication failed:', error);
      throw error;
    }
  }

  /**
   * Fallback authentication for development/testing
   */
  createMockAuthentication(): {
    client: AttendanceAPIClient;
    user: DiscordUserInfo;
  } {
    const mockToken = 'mock_access_token_' + Date.now();
    const mockUser: DiscordUserInfo = {
      id: '123456789012345678',
      username: 'DemoUser',
      discriminator: '0001',
      avatar: undefined,
      global_name: 'Demo User'
    };

    const client = new AttendanceAPIClient(this.baseUrl, mockToken);
    
    return { client, user: mockUser };
  }
}

// ========================
// REACT HOOKS (Optional)
// ========================

/**
 * React hooks for common attendance operations
 * Requires React 16.8+ and a state management solution
 */

// Example React hook for managing events
export function useAttendanceEvents(apiClient: AttendanceAPIClient) {
  // This would require React to be available
  // const [events, setEvents] = useState<AttendanceEvent[]>([]);
  // const [loading, setLoading] = useState(false);
  // const [error, setError] = useState<string | null>(null);

  const loadEvents = async (params?: Parameters<typeof apiClient.getEvents>[0]) => {
    try {
      // setLoading(true);
      // setError(null);
      const response = await apiClient.getEvents(params);
      // setEvents(response.data || []);
      return response;
    } catch (err) {
      const errorMessage = err instanceof AttendanceAPIError ? err.message : 'Failed to load events';
      // setError(errorMessage);
      throw err;
    } finally {
      // setLoading(false);
    }
  };

  const createEvent = async (data: CreateEventRequest) => {
    try {
      // setError(null);
      const response = await apiClient.createEvent(data);
      // Optionally refresh the events list
      await loadEvents();
      return response;
    } catch (err) {
      const errorMessage = err instanceof AttendanceAPIError ? err.message : 'Failed to create event';
      // setError(errorMessage);
      throw err;
    }
  };

  return {
    // events,
    // loading,
    // error,
    loadEvents,
    createEvent,
  };
}

// ========================
// UTILITY FUNCTIONS
// ========================

/**
 * Format date for API consumption
 */
export function formatDateForAPI(date: Date): string {
  return date.toISOString();
}

/**
 * Parse API date response
 */
export function parseAPIDate(dateString: string): Date {
  return new Date(dateString);
}

/**
 * Validate Discord ID format
 */
export function isValidDiscordId(discordId: string): boolean {
  return /^\d{17,19}$/.test(discordId);
}

/**
 * Format squad statistics for display
 */
export function formatSquadStats(stats: EventStatistics) {
  return {
    summary: {
      totalParticipants: stats.totalMembers + stats.totalStaff,
      attendanceRate: ((stats.totalMembers - stats.totalLateMembers) / stats.totalMembers * 100).toFixed(1),
      leadershipRatio: (stats.totalLeads / stats.totalMembers * 100).toFixed(1),
    },
    squads: stats.squadBreakdown.map(squad => ({
      ...squad,
      attendanceRate: squad.memberCount > 0 
        ? ((squad.memberCount - squad.lateCount) / squad.memberCount * 100).toFixed(1)
        : '0',
    })),
  };
}

// ========================
// EXAMPLE USAGE
// ========================

/*
// Initialize the API client
const apiClient = new AttendanceAPIClient(
  'https://your-bot-domain.com',
  'your-discord-token'
);

// Example: Create and manage an event
async function exampleEventManagement() {
  try {
    // Create a new event
    const newEvent = await apiClient.createEvent({
      date: formatDateForAPI(new Date('2025-08-25T14:00:00Z')),
      hostDiscordId: '123456789012345678'
    });

    console.log('Created event:', newEvent.data);

    // Add some squad members
    await apiClient.addSquadMember(newEvent.data.id, 'Alpha', {
      discordId: '987654321098765432',
      isLead: true
    });

    await apiClient.addSquadMember(newEvent.data.id, 'Alpha', {
      discordId: '111222333444555666',
      isLate: true,
      lateNote: 'Traffic delay'
    });

    // Get updated event details
    const updatedEvent = await apiClient.getEvent(newEvent.data.id);
    console.log('Updated event:', updatedEvent.data);

    // Get event statistics
    const stats = await apiClient.getEventStats(newEvent.data.id);
    const formattedStats = formatSquadStats(stats.data);
    console.log('Event statistics:', formattedStats);

  } catch (error) {
    if (error instanceof AttendanceAPIError) {
      console.error('API Error:', error.message, error.details);
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

// Example: Get available squad templates
async function exampleSquadTemplates() {
  try {
    const templates = await apiClient.getSquadTemplates();
    console.log('Available squads:', templates.data);
    
    // Use templates to populate a dropdown
    templates.data.forEach(template => {
      console.log(`Squad: ${template.name}${template.number ? ` (${template.number})` : ''}`);
    });
  } catch (error) {
    console.error('Failed to load squad templates:', error);
  }
}
*/
