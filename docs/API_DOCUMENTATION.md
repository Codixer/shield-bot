# Attendance System External API Documentation

This document describes the external API endpoints for the Shield Bot Attendance System. The API provides comprehensive access to attendance tracking functionality for external applications and frontends.

## Table of Contents

1. [Authentication](#authentication)
2. [Base URL & Versioning](#base-url--versioning)
3. [Response Format](#response-format)
4. [Error Handling](#error-handling)
5. [Rate Limiting](#rate-limiting)
6. [Endpoints](#endpoints)
   - [Event Management](#event-management)
   - [Squad Management](#squad-management)
   - [Staff Management](#staff-management)
   - [User Management](#user-management)
   - [Utilities](#utilities)
7. [Examples](#examples)
8. [SDKs and Libraries](#sdks-and-libraries)

## Authentication

The API supports multiple authentication methods:

### 1. Discord OAuth2 (Recommended for user-facing applications)

For Discord Activities and web applications, use the OAuth2 flow:

1. **Get Authorization Code** - Use Discord SDK or redirect user to Discord OAuth
2. **Exchange Code for Token** - Use our token exchange endpoints
3. **Use Access Token** - Include in Authorization header

```http
Authorization: Bearer <discord_access_token>
```

#### Token Exchange Endpoints

Multiple endpoints are available for maximum compatibility:

```http
POST /api/v1/oauth/token          (Primary)
POST /api/v1/auth/token           (Alternative)
POST /api/v1/attendance/auth/token (Attendance-specific)
POST /api/oauth/token             (Legacy)
POST /api/discord/token           (Discord-specific)
```

**Request Body:**
```json
{
  "code": "4ES2ROUtdvbRrpeDrh0pAmJKshjTfC",
  "client_id": "1369034090103439470"
}
```

**Response:**
```json
{
  "access_token": "actual_discord_access_token",
  "token_type": "Bearer",
  "expires_in": 604800,
  "refresh_token": "refresh_token_here",
  "scope": "identify guilds.members.read"
}
```

#### User Information Endpoints

Get current user info using access token:

```http
GET /api/v1/oauth/user
GET /api/v1/auth/user  
GET /api/discord/user
```

### 2. API Key (For server-to-server communication)

Include the API key in the X-API-Key header:

```http
X-API-Key: <your_api_key>
```

**Note:** Contact the system administrator to obtain an API key.

## Base URL & Versioning

```
Base URL: https://your-bot-domain.com/api/v1/attendance
```

All endpoints are prefixed with `/api/v1/attendance`. The API uses semantic versioning to ensure backward compatibility.

## Response Format

All responses follow a consistent JSON structure:

### Successful Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Paginated Response

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Error Response

```json
{
  "error": "Error message",
  "details": "Additional error information"
}
```

## Error Handling

The API uses standard HTTP status codes:

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

## Development Setup

### Environment Variables

For Discord OAuth2 integration, set these environment variables:

```bash
DISCORD_CLIENT_ID=your_discord_application_id
DISCORD_CLIENT_SECRET=your_discord_application_secret
DISCORD_REDIRECT_URI=https://your-domain.com/oauth/callback
```

### Discord Activity Setup

1. **Create Discord Application** at https://discord.com/developers/applications
2. **Add Activity URL Mappings** in OAuth2 settings
3. **Set Redirect URIs** to include your activity endpoints
4. **Copy Client ID and Secret** to environment variables

### Frontend Integration

Use the provided TypeScript client for easy integration:

```typescript
import { AttendanceAPIClient, DiscordAuthWorkflow } from './attendance-client';

// Initialize with authentication
const authWorkflow = new DiscordAuthWorkflow({
  clientId: '1369034090103439470',
  apiBaseUrl: 'https://your-api-domain.com'
});

// Authenticate user
const token = await authWorkflow.authenticate();

// Use API client
const client = new AttendanceAPIClient({
  baseUrl: 'https://your-api-domain.com',
  token: token
});

const events = await client.getEvents();
```

### Example Discord Activity

See `examples/discord-activity-demo.html` for a complete working example of:
- Discord SDK integration
- OAuth2 authentication flow
- API usage with fallback handling
- Mock authentication for testing

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- **User Authentication**: 100 requests per minute per user
- **API Key Authentication**: 1000 requests per minute per key

Rate limit headers are included in responses:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Endpoints

### Event Management

#### Get All Events

```http
GET /api/v1/attendance/events
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)
- `startDate` (optional): Filter events from this date (ISO format)
- `endDate` (optional): Filter events until this date (ISO format)
- `hostId` (optional): Filter events by host user ID
- `includeArchived` (optional): Include archived events (default: false)

**Example:**
```bash
curl -H "Authorization: Bearer <token>" \
  "https://your-domain.com/api/v1/attendance/events?page=1&limit=10&startDate=2025-01-01"
```

#### Get Specific Event

```http
GET /api/v1/attendance/events/{eventId}
```

**Path Parameters:**
- `eventId`: The unique identifier of the event

#### Create New Event

```http
POST /api/v1/attendance/events
```

**Request Body:**
```json
{
  "date": "2025-08-25T14:00:00Z",
  "hostDiscordId": "123456789012345678",
  "cohostDiscordId": "987654321098765432"
}
```

#### Update Event

```http
PUT /api/v1/attendance/events/{eventId}
```

**Request Body:**
```json
{
  "date": "2025-08-25T15:00:00Z",
  "hostDiscordId": "123456789012345678"
}
```

#### Delete Event

```http
DELETE /api/v1/attendance/events/{eventId}
```

### Squad Management

#### Get Event Squads

```http
GET /api/v1/attendance/events/{eventId}/squads
```

#### Add Squad Member

```http
POST /api/v1/attendance/events/{eventId}/squads/{squadName}/members
```

**Request Body:**
```json
{
  "discordId": "123456789012345678",
  "isLead": false,
  "isLate": true,
  "lateNote": "Traffic delay"
}
```

#### Move Member to Squad

```http
PUT /api/v1/attendance/events/{eventId}/members/{discordId}/squad
```

**Request Body:**
```json
{
  "squadName": "Alpha",
  "isSplit": true,
  "splitFrom": "Bravo"
}
```

#### Update Member Status

```http
PUT /api/v1/attendance/events/{eventId}/members/{discordId}/status
```

**Request Body:**
```json
{
  "isLead": true,
  "isLate": false,
  "lateNote": null
}
```

#### Remove Member

```http
DELETE /api/v1/attendance/events/{eventId}/members/{discordId}
```

### Staff Management

#### Add Staff Member

```http
POST /api/v1/attendance/events/{eventId}/staff
```

**Request Body:**
```json
{
  "discordId": "123456789012345678"
}
```

#### Set Event Cohost

```http
PUT /api/v1/attendance/events/{eventId}/cohost
```

**Request Body:**
```json
{
  "discordId": "123456789012345678"
}
```

### User Management

#### Get User's Active Event

```http
GET /api/v1/attendance/users/{discordId}/active-event
```

#### Set User's Active Event

```http
PUT /api/v1/attendance/users/{discordId}/active-event
```

**Request Body:**
```json
{
  "eventId": 42
}
```

#### Clear User's Active Event

```http
DELETE /api/v1/attendance/users/{discordId}/active-event
```

### Utilities

#### Get Squad Templates

```http
GET /api/v1/attendance/squads/templates
```

Returns available squad templates with names and numbers.

#### Get Event Statistics

```http
GET /api/v1/attendance/stats/{eventId}
```

Returns detailed statistics for an event including member counts, late arrivals, and squad breakdowns.

## Examples

### JavaScript/TypeScript Frontend Example

```typescript
class AttendanceAPI {
  private baseUrl = 'https://your-domain.com/api/v1/attendance';
  private token: string;

  constructor(discordToken: string) {
    this.token = discordToken;
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API request failed');
    }

    return response.json();
  }

  async getEvents(params?: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
  }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/events${query ? `?${query}` : ''}`);
  }

  async createEvent(data: {
    date: string;
    hostDiscordId?: string;
    cohostDiscordId?: string;
  }) {
    return this.request('/events', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async addSquadMember(eventId: number, squadName: string, data: {
    discordId: string;
    isLead?: boolean;
    isLate?: boolean;
    lateNote?: string;
  }) {
    return this.request(`/events/${eventId}/squads/${squadName}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getEventStats(eventId: number) {
    return this.request(`/stats/${eventId}`);
  }
}

// Usage
const api = new AttendanceAPI('your-discord-token');

// Create an event
const event = await api.createEvent({
  date: '2025-08-25T14:00:00Z',
  hostDiscordId: '123456789012345678'
});

// Add a member to a squad
await api.addSquadMember(event.data.id, 'Alpha', {
  discordId: '987654321098765432',
  isLead: true
});

// Get event statistics
const stats = await api.getEventStats(event.data.id);
```

### Python Backend Example

```python
import requests
from typing import Optional, Dict, Any

class AttendanceAPI:
    def __init__(self, api_key: str, base_url: str = "https://your-domain.com/api/v1/attendance"):
        self.base_url = base_url
        self.headers = {
            "X-API-Key": api_key,
            "Content-Type": "application/json"
        }
    
    def _request(self, method: str, endpoint: str, data: Optional[Dict] = None) -> Dict[Any, Any]:
        url = f"{self.base_url}{endpoint}"
        response = requests.request(method, url, headers=self.headers, json=data)
        response.raise_for_status()
        return response.json()
    
    def get_events(self, **params) -> Dict[Any, Any]:
        return self._request("GET", "/events", params)
    
    def create_event(self, date: str, host_discord_id: Optional[str] = None, 
                    cohost_discord_id: Optional[str] = None) -> Dict[Any, Any]:
        data = {"date": date}
        if host_discord_id:
            data["hostDiscordId"] = host_discord_id
        if cohost_discord_id:
            data["cohostDiscordId"] = cohost_discord_id
        
        return self._request("POST", "/events", data)
    
    def add_squad_member(self, event_id: int, squad_name: str, discord_id: str,
                        is_lead: bool = False, is_late: bool = False, 
                        late_note: Optional[str] = None) -> Dict[Any, Any]:
        data = {
            "discordId": discord_id,
            "isLead": is_lead,
            "isLate": is_late
        }
        if late_note:
            data["lateNote"] = late_note
        
        return self._request("POST", f"/events/{event_id}/squads/{squad_name}/members", data)
    
    def get_event_stats(self, event_id: int) -> Dict[Any, Any]:
        return self._request("GET", f"/stats/{event_id}")

# Usage
api = AttendanceAPI("your-api-key")

# Create an event
event = api.create_event(
    date="2025-08-25T14:00:00Z",
    host_discord_id="123456789012345678"
)

# Add a member to a squad
api.add_squad_member(
    event_id=event["data"]["id"],
    squad_name="Alpha",
    discord_id="987654321098765432",
    is_lead=True
)

# Get event statistics
stats = api.get_event_stats(event["data"]["id"])
print(f"Total members: {stats['data']['totalMembers']}")
```

### curl Examples

```bash
# Create an event
curl -X POST "https://your-domain.com/api/v1/attendance/events" \
  -H "Authorization: Bearer <discord-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-08-25T14:00:00Z",
    "hostDiscordId": "123456789012345678"
  }'

# Get all events with pagination
curl -H "Authorization: Bearer <discord-token>" \
  "https://your-domain.com/api/v1/attendance/events?page=1&limit=10"

# Add a squad member
curl -X POST "https://your-domain.com/api/v1/attendance/events/1/squads/Alpha/members" \
  -H "Authorization: Bearer <discord-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "discordId": "987654321098765432",
    "isLead": true,
    "isLate": false
  }'

# Get event statistics
curl -H "Authorization: Bearer <discord-token>" \
  "https://your-domain.com/api/v1/attendance/stats/1"

# Move a member to different squad
curl -X PUT "https://your-domain.com/api/v1/attendance/events/1/members/987654321098765432/squad" \
  -H "Authorization: Bearer <discord-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "squadName": "Bravo",
    "isSplit": true,
    "splitFrom": "Alpha"
  }'
```

## Data Models

### Event Object

```json
{
  "id": 1,
  "date": "2025-08-25T14:00:00Z",
  "hostId": 123,
  "cohostId": 456,
  "createdAt": "2025-08-23T10:00:00Z",
  "updatedAt": "2025-08-23T10:00:00Z",
  "host": {
    "id": 123,
    "discordId": "123456789012345678"
  },
  "cohost": {
    "id": 456,
    "discordId": "987654321098765432"
  },
  "squads": [
    {
      "id": 1,
      "name": "Alpha",
      "eventId": 1,
      "members": [
        {
          "id": 1,
          "userId": 789,
          "squadId": 1,
          "isLead": true,
          "isLate": false,
          "lateNote": null,
          "isSplit": false,
          "splitFrom": null,
          "user": {
            "id": 789,
            "discordId": "111222333444555666"
          }
        }
      ]
    }
  ],
  "staff": [
    {
      "id": 1,
      "userId": 999,
      "eventId": 1,
      "user": {
        "id": 999,
        "discordId": "777888999000111222"
      }
    }
  ]
}
```

### Statistics Object

```json
{
  "eventId": 1,
  "totalSquads": 5,
  "totalMembers": 25,
  "totalStaff": 3,
  "totalLateMembers": 2,
  "totalLeads": 5,
  "totalSplits": 1,
  "squadBreakdown": [
    {
      "squadName": "Alpha",
      "memberCount": 5,
      "leadCount": 1,
      "lateCount": 0,
      "splitCount": 0
    },
    {
      "squadName": "Bravo",
      "memberCount": 5,
      "leadCount": 1,
      "lateCount": 1,
      "splitCount": 1
    }
  ]
}
```


## Support and Contributing

- **Issues**: Report bugs or request features via GitHub Issues
- **Documentation**: Help improve this documentation via pull requests
- **Discord**: Join our Discord server for real-time support and discussions

## Changelog

### v1.0.0 (August 2025)
- Initial API release
- Full CRUD operations for events, squads, and members
- Authentication via Discord OAuth2 and API keys
- Comprehensive statistics and reporting
- Rate limiting and error handling
