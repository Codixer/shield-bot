/**
 * TypeScript interfaces for the External Attendance System API
 * These interfaces represent the data structures exchanged between frontend and backend
 */

// ========================
// COMMON TYPES
// ========================

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
  message?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T = any> extends APIResponse<T> {
  pagination: PaginationMeta;
}

// ========================
// USER TYPES
// ========================

export interface User {
  id: number;
  discordId: string;
}

export interface UserWithVRChatAccounts extends User {
  vrchatAccounts?: VRChatAccount[];
}

export interface VRChatAccount {
  id: number;
  vrcUserId: string;
  vrchatUsername?: string;
  accountType: 'MAIN' | 'ALT' | 'UNVERIFIED';
  userId: number;
}

// ========================
// EVENT TYPES
// ========================

export interface AttendanceEvent {
  id: number;
  date: Date;
  hostId?: number;
  cohostId?: number;
  createdAt: Date;
  updatedAt: Date;
  host?: User;
  cohost?: User;
  staff?: AttendanceStaff[];
  squads?: Squad[];
  _count?: {
    squads: number;
    staff: number;
  };
}

export interface CreateEventRequest {
  date: string; // ISO date string
  hostDiscordId?: string;
  cohostDiscordId?: string;
}

export interface UpdateEventRequest {
  date?: string; // ISO date string
  hostDiscordId?: string;
  cohostDiscordId?: string;
}

export interface EventQueryParams {
  page?: number;
  limit?: number;
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
  hostId?: number;
  includeArchived?: boolean;
}

// ========================
// SQUAD TYPES
// ========================

export interface Squad {
  id: number;
  name: string;
  eventId: number;
  event?: AttendanceEvent;
  members?: SquadMember[];
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
  squad?: Squad;
  user?: User;
}

export interface AddSquadMemberRequest {
  discordId: string;
  isLead?: boolean;
  isLate?: boolean;
  lateNote?: string;
}

export interface MoveSquadMemberRequest {
  squadName: string;
  isSplit?: boolean;
  splitFrom?: string;
}

export interface UpdateMemberStatusRequest {
  isLead?: boolean;
  isLate?: boolean;
  lateNote?: string;
}

// ========================
// STAFF TYPES
// ========================

export interface AttendanceStaff {
  id: number;
  userId: number;
  eventId: number;
  event?: AttendanceEvent;
  user?: User;
}

export interface AddStaffRequest {
  discordId: string;
}

export interface SetCohostRequest {
  discordId: string;
}

// ========================
// ACTIVE EVENT TYPES
// ========================

export interface ActiveAttendanceEvent {
  id: number;
  userId: number;
  eventId: number;
  event?: AttendanceEvent;
  user?: User;
}

export interface ActiveEventResponse {
  eventId: number;
  event: AttendanceEvent;
}

export interface SetActiveEventRequest {
  eventId: number;
}

// ========================
// SQUAD TEMPLATE TYPES
// ========================

export interface SquadTemplate {
  id: string;
  name: string;
  number?: string;
}

// ========================
// STATISTICS TYPES
// ========================

export interface EventStatistics {
  eventId: number;
  totalSquads: number;
  totalMembers: number;
  totalStaff: number;
  totalLateMembers: number;
  totalLeads: number;
  totalSplits: number;
  squadBreakdown: SquadStatistics[];
}

export interface SquadStatistics {
  squadName: string;
  memberCount: number;
  leadCount: number;
  lateCount: number;
  splitCount: number;
}

// ========================
// API ENDPOINT TYPES
// ========================

// Event Management
export type GetEventsResponse = PaginatedResponse<AttendanceEvent[]>;
export type GetEventResponse = APIResponse<AttendanceEvent>;
export type CreateEventResponse = APIResponse<AttendanceEvent>;
export type UpdateEventResponse = APIResponse<AttendanceEvent>;
export type DeleteEventResponse = APIResponse<void>;

// Squad Management
export type GetEventSquadsResponse = APIResponse<Squad[]>;
export type AddSquadMemberResponse = APIResponse<SquadMember>;
export type MoveSquadMemberResponse = APIResponse<AttendanceEvent>;
export type UpdateMemberStatusResponse = APIResponse<AttendanceEvent>;
export type RemoveMemberResponse = APIResponse<void>;

// Staff Management
export type AddStaffResponse = APIResponse<AttendanceStaff>;
export type SetCohostResponse = APIResponse<AttendanceEvent>;

// User Management
export type GetActiveEventResponse = APIResponse<ActiveEventResponse>;
export type SetActiveEventResponse = APIResponse<void>;
export type ClearActiveEventResponse = APIResponse<void>;

// Utility
export type GetSquadTemplatesResponse = APIResponse<SquadTemplate[]>;
export type GetEventStatsResponse = APIResponse<EventStatistics>;

// ========================
// ERROR TYPES
// ========================

export interface APIError {
  error: string;
  details?: string;
  statusCode?: number;
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
// AUTHENTICATION TYPES
// ========================

export interface AuthenticationResult {
  userId: number;
  discordId: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator?: string;
  avatar?: string;
  email?: string;
}

// ========================
// REQUEST VALIDATION TYPES
// ========================

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}
