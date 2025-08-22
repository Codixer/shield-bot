# Discord Activity Attendance System - Backend API Specification

This document outlines the complete API specification required for the web-based Discord Activity Attendance System to functionally operate. This information can be used to implement the necessary backend endpoints within your Discord bot's infrastructure.

## API Overview

The web application interacts with your backend via a RESTful API. The primary goal of this API is to manage attendance events, squads, and members, leveraging the data models defined in your Prisma schema and the logic within your `AttendanceManager`.

**Base URL**: All API endpoints are expected to be prefixed with `/api`. For example, if your backend is running on `http://localhost:3001`, an endpoint like `/attendance/events` would be accessed at `http://localhost:3001/api/attendance/events`.

## Data Models

The following TypeScript interfaces represent the data structures exchanged between the frontend and backend. These directly correspond to your Prisma schema and `src/types/attendance.ts`.

```typescript
export interface User {
  id: number; // Database ID
  discordId: string; // Discord User ID
  username?: string;
  avatar?: string;
}

export interface AttendanceEvent {
  id: number;
  date: Date;
  hostId?: number;
  cohostId?: number;
  createdAt: Date;
  updatedAt: Date;
  host?: User; // Populated when included in query
  cohost?: User; // Populated when included in query
  staff: AttendanceStaff[]; // Populated when included in query
  squads: Squad[]; // Populated when included in query
}

export interface Squad {
  id: number;
  name: string; // e.g., "Adam", "Baker"
  eventId: number;
  event: AttendanceEvent;
  members: SquadMember[]; // Populated when included in query
}

export interface SquadMember {
  id: number;
  userId: number;
  squadId: number;
  isLead: boolean;
  isLate: boolean;
  lateNote?: string;
  isSplit: boolean;
  splitFrom?: string;
  squad: Squad;
  user: User; // Populated when included in query
}

export interface AttendanceStaff {
  id: number;
  userId: number;
  eventId: number;
  event: AttendanceEvent;
  user: User; // Populated when included in query
}
```

## Authentication Endpoints

These endpoints are crucial for the Discord Activity SDK to authenticate the user with your backend.

### 1. Exchange Discord OAuth Code for Access Token
- **Endpoint**: `/api/discord/token`
- **HTTP Method**: `POST`
- **Description**: Exchanges the authorization code received from Discord's SDK for an access token. This is a critical step in the OAuth2 flow.

**Request Body**:
```json
{
  "code": "string" // The authorization code from Discord SDK
}
```

**Response Body**:
```json
{
  "access_token": "string",
  "token_type": "Bearer",
  "expires_in": 604800, // Seconds until expiration
  "refresh_token": "string",
  "scope": "identify guilds" // e.g., "identify guilds"
}
```

**Environment Variables Required**:
```
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_REDIRECT_URI=your_redirect_uri
```

### 2. Get Guild Members (Placeholder)
- **Endpoint**: `/api/discord/guild/:guildId/members`
- **HTTP Method**: `GET`
- **Description**: Placeholder for fetching guild members. Returns empty array by default.

**Response Body**: `[]` (Array of Discord user objects)

## User Endpoints

These endpoints manage the User entities in your database, linking them to Discord IDs.

### 1. Find or Create User by Discord ID
- **Endpoint**: `/api/users/discord/:discordId`
- **HTTP Method**: `POST`
- **Description**: Finds a user in your database by their Discord ID. If the user does not exist, it creates a new user entry.

**Request Body** (optional):
```json
{
  "discordId": "string" // The Discord User ID
}
```

**Response Body**: `User` object
```json
{
  "id": 1,
  "discordId": "123456789012345678",
  "username": "john_doe", // Optional, can be null
  "avatar": "avatar_hash" // Optional, can be null
}
```

## Attendance Event Endpoints

These endpoints manage the AttendanceEvent entities and their associated data.

### 1. Create New Attendance Event
- **Endpoint**: `/api/attendance/events`
- **HTTP Method**: `POST`
- **Description**: Creates a new attendance event.

**Request Body**:
```json
{
  "date": "2025-08-22T20:42:42.000Z", // ISO 8601 format
  "hostId": 1, // Optional, database ID of the host user
  "cohostId": 2 // Optional, database ID of the cohost user
}
```

**Response**: `201 Created` + `AttendanceEvent` object

### 2. Get Event Details
- **Endpoint**: `/api/attendance/events/:eventId`
- **HTTP Method**: `GET`
- **Description**: Retrieves details for a specific attendance event, including its associated squads, members, and staff.

**Response**: `200 OK` + `AttendanceEvent` object with all relations populated

### 3. Get User's Active Event
- **Endpoint**: `/api/attendance/users/:userId/active-event`
- **HTTP Method**: `GET`
- **Description**: Retrieves the currently active attendance event for a given user.

**Response**: 
- `200 OK` + `AttendanceEvent` object if active event exists
- `404 Not Found` if no active event

### 4. Set User's Active Event
- **Endpoint**: `/api/attendance/users/:userId/active-event`
- **HTTP Method**: `PUT`
- **Description**: Sets a specific event as the active event for a user.

**Request Body**:
```json
{
  "eventId": 42 // Database ID of the event to set as active
}
```

**Response**: `204 No Content`

### 5. Delete Attendance Event
- **Endpoint**: `/api/attendance/events/:eventId`
- **HTTP Method**: `DELETE`
- **Description**: Deletes an attendance event and all associated data (squads, members, staff).

**Response**: `204 No Content`

## Squad and Member Management Endpoints

### 1. Add User to Squad
- **Endpoint**: `/api/attendance/events/:eventId/squads/:squadName/members`
- **HTTP Method**: `POST`
- **Description**: Adds a user to a specific squad within an event. Creates squad if it doesn't exist.

**Request Body**:
```json
{
  "userId": 5 // Database ID of the user to add
}
```

**Response**: `201 Created` + `SquadMember` object

### 2. Remove User from Event
- **Endpoint**: `/api/attendance/events/:eventId/users/:userId`
- **HTTP Method**: `DELETE`
- **Description**: Removes a user from all squads and staff roles within a specific event.

**Response**: `204 No Content`

### 3. Move User to Different Squad
- **Endpoint**: `/api/attendance/events/:eventId/users/:userId/move`
- **HTTP Method**: `PUT`
- **Description**: Moves a user from their current squad(s) to a new specified squad within an event.

**Request Body**:
```json
{
  "squadName": "Baker" // Name of the new squad
}
```

**Response**: `200 OK` + `SquadMember` object

### 4. Mark User as Lead
- **Endpoint**: `/api/attendance/events/:eventId/users/:userId/lead`
- **HTTP Method**: `PUT`
- **Description**: Marks a user as a lead within their current squad for a specific event.

**Response**: `204 No Content`

### 5. Mark User as Late
- **Endpoint**: `/api/attendance/events/:eventId/users/:userId/late`
- **HTTP Method**: `PUT`
- **Description**: Marks a user as late for a specific event, optionally with a note.

**Request Body**:
```json
{
  "note": "Arrived 10 minutes late" // Optional late note
}
```

**Response**: `204 No Content`

### 6. Mark User as Split
- **Endpoint**: `/api/attendance/events/:eventId/users/:userId/split`
- **HTTP Method**: `PUT`
- **Description**: Marks a user as "split" from a previous squad and moves them to a new squad.

**Request Body**:
```json
{
  "newSquadName": "Charlie", // Name of the squad the user is splitting to
  "splitFrom": "Baker" // Name of the squad the user is splitting from
}
```

**Response**: `204 No Content`

### 7. Add Staff Member
- **Endpoint**: `/api/attendance/events/:eventId/staff`
- **HTTP Method**: `POST`
- **Description**: Adds a user as a staff member for a specific event.

**Request Body**:
```json
{
  "userId": 7 // Database ID of the user to add as staff
}
```

**Response**: `204 No Content`

### 8. Set Co-Host
- **Endpoint**: `/api/attendance/events/:eventId/cohost`
- **HTTP Method**: `PUT`
- **Description**: Sets a user as the co-host for a specific event.

**Request Body**:
```json
{
  "userId": 9 // Database ID of the user to set as co-host
}
```

**Response**: `204 No Content`

## Error Handling

Your API returns appropriate HTTP status codes for different scenarios:

- **200 OK**: Successful request with data.
- **201 Created**: Resource successfully created.
- **204 No Content**: Successful request with no data to return (e.g., for PUT/DELETE operations).
- **400 Bad Request**: Invalid request body or parameters.
- **401 Unauthorized**: Authentication failed or missing.
- **403 Forbidden**: User does not have permission to perform the action.
- **404 Not Found**: Resource not found (e.g., eventId or userId does not exist).
- **500 Internal Server Error**: Unexpected server-side error.

**Error Response Format**:
```json
{
  "error": "Error message describing what went wrong",
  "code": "OPTIONAL_ERROR_CODE" // Optional machine-readable error code
}
```

## Implementation Notes

- All endpoints include proper input validation and error handling
- Database operations are wrapped in try-catch blocks
- Numeric parameters are validated before processing
- String parameters are trimmed where appropriate
- The API uses the existing `AttendanceManager` class for all database operations
- Environment variables are required for Discord OAuth functionality

## Testing

To test the API endpoints, you can use tools like Postman or curl. Make sure to:

1. Set up the required environment variables for Discord OAuth
2. Build and start the application: `yarn build && yarn start`
3. Access endpoints at `http://localhost:3000/api/...`
4. Test the complete flow: create event → add users → manage squads → retrieve data

## Security Considerations

- Add proper authentication/authorization for production use
- Implement rate limiting for OAuth endpoints
- Validate user permissions before allowing event modifications
- Consider adding CORS configuration for web client integration
- Add request logging and monitoring
