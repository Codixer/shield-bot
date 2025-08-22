/**
 * TypeScript interfaces for the Discord Activity Attendance System API
 * These interfaces represent the data structures exchanged between frontend and backend
 */

export interface User {
  id: number; // Database ID
  discordId: string; // Discord User ID
  username?: string | null;
  avatar?: string | null;
}

export interface AttendanceEvent {
  id: number;
  date: Date;
  hostId?: number | null;
  cohostId?: number | null;
  createdAt: Date;
  updatedAt: Date;
  host?: User | null; // Populated when included in query
  cohost?: User | null; // Populated when included in query
  staff: AttendanceStaff[]; // Populated when included in query
  squads: Squad[]; // Populated when included in query
}

export interface Squad {
  id: number;
  name: string; // e.g., "Adam", "Baker"
  eventId: number;
  members: SquadMember[]; // Populated when included in query
}

export interface SquadMember {
  id: number;
  userId: number;
  squadId: number;
  isLead: boolean;
  isLate: boolean;
  lateNote?: string | null;
  isSplit: boolean;
  splitFrom?: string | null;
  user: User; // Populated when included in query
}

export interface AttendanceStaff {
  id: number;
  userId: number;
  eventId: number;
  user: User; // Populated when included in query
}

// Request/Response types for API endpoints

export interface CreateEventRequest {
  date: string; // ISO 8601 format
  hostId?: number;
  cohostId?: number;
}

export interface SetActiveEventRequest {
  eventId: number;
}

export interface AddUserToSquadRequest {
  userId: number;
}

export interface MoveUserRequest {
  squadName: string;
}

export interface MarkLateRequest {
  note?: string;
}

export interface MarkSplitRequest {
  newSquadName: string;
  splitFrom: string;
}

export interface AddStaffRequest {
  userId: number;
}

export interface SetCohostRequest {
  userId: number;
}

export interface FindOrCreateUserRequest {
  discordId: string;
}

export interface DiscordTokenRequest {
  code: string;
}

export interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface ApiError {
  error: string;
  code?: string;
}
