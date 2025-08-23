import type { Context } from "koa";
import type { ValidationError, ValidationResult } from "./types/attendance-external.js";

/**
 * Validation utilities for the Attendance API
 */

export class AttendanceValidator {
  
  /**
   * Validate Discord ID format
   */
  static validateDiscordId(discordId: string): boolean {
    return /^\d{17,19}$/.test(discordId);
  }

  /**
   * Validate ISO date string
   */
  static validateISODate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && dateString === date.toISOString();
  }

  /**
   * Validate squad name
   */
  static validateSquadName(squadName: string): boolean {
    return typeof squadName === 'string' && squadName.trim().length > 0 && squadName.length <= 50;
  }

  /**
   * Validate event creation request
   */
  static validateCreateEventRequest(body: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!body.date) {
      errors.push({
        field: 'date',
        message: 'Date is required',
        code: 'REQUIRED'
      });
    } else if (!this.validateISODate(body.date)) {
      errors.push({
        field: 'date',
        message: 'Date must be a valid ISO date string',
        code: 'INVALID_FORMAT'
      });
    }

    if (body.hostDiscordId && !this.validateDiscordId(body.hostDiscordId)) {
      errors.push({
        field: 'hostDiscordId',
        message: 'Host Discord ID must be a valid Discord snowflake',
        code: 'INVALID_FORMAT'
      });
    }

    if (body.cohostDiscordId && !this.validateDiscordId(body.cohostDiscordId)) {
      errors.push({
        field: 'cohostDiscordId',
        message: 'Cohost Discord ID must be a valid Discord snowflake',
        code: 'INVALID_FORMAT'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate add squad member request
   */
  static validateAddSquadMemberRequest(body: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!body.discordId) {
      errors.push({
        field: 'discordId',
        message: 'Discord ID is required',
        code: 'REQUIRED'
      });
    } else if (!this.validateDiscordId(body.discordId)) {
      errors.push({
        field: 'discordId',
        message: 'Discord ID must be a valid Discord snowflake',
        code: 'INVALID_FORMAT'
      });
    }

    if (body.isLead !== undefined && typeof body.isLead !== 'boolean') {
      errors.push({
        field: 'isLead',
        message: 'isLead must be a boolean',
        code: 'INVALID_TYPE'
      });
    }

    if (body.isLate !== undefined && typeof body.isLate !== 'boolean') {
      errors.push({
        field: 'isLate',
        message: 'isLate must be a boolean',
        code: 'INVALID_TYPE'
      });
    }

    if (body.lateNote !== undefined && body.lateNote !== null && typeof body.lateNote !== 'string') {
      errors.push({
        field: 'lateNote',
        message: 'lateNote must be a string or null',
        code: 'INVALID_TYPE'
      });
    }

    if (body.lateNote && body.lateNote.length > 500) {
      errors.push({
        field: 'lateNote',
        message: 'lateNote must be 500 characters or less',
        code: 'TOO_LONG'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate move squad member request
   */
  static validateMoveSquadMemberRequest(body: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!body.squadName) {
      errors.push({
        field: 'squadName',
        message: 'Squad name is required',
        code: 'REQUIRED'
      });
    } else if (!this.validateSquadName(body.squadName)) {
      errors.push({
        field: 'squadName',
        message: 'Squad name must be a non-empty string (max 50 characters)',
        code: 'INVALID_FORMAT'
      });
    }

    if (body.isSplit !== undefined && typeof body.isSplit !== 'boolean') {
      errors.push({
        field: 'isSplit',
        message: 'isSplit must be a boolean',
        code: 'INVALID_TYPE'
      });
    }

    if (body.splitFrom !== undefined && body.splitFrom !== null && typeof body.splitFrom !== 'string') {
      errors.push({
        field: 'splitFrom',
        message: 'splitFrom must be a string or null',
        code: 'INVALID_TYPE'
      });
    }

    if (body.isSplit && !body.splitFrom) {
      errors.push({
        field: 'splitFrom',
        message: 'splitFrom is required when isSplit is true',
        code: 'REQUIRED_CONDITIONAL'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate pagination parameters
   */
  static validatePaginationParams(query: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (query.page !== undefined) {
      const page = Number(query.page);
      if (isNaN(page) || page < 1) {
        errors.push({
          field: 'page',
          message: 'Page must be a positive integer',
          code: 'INVALID_VALUE'
        });
      }
    }

    if (query.limit !== undefined) {
      const limit = Number(query.limit);
      if (isNaN(limit) || limit < 1 || limit > 100) {
        errors.push({
          field: 'limit',
          message: 'Limit must be an integer between 1 and 100',
          code: 'INVALID_VALUE'
        });
      }
    }

    if (query.startDate && !this.validateISODate(query.startDate)) {
      errors.push({
        field: 'startDate',
        message: 'Start date must be a valid ISO date string',
        code: 'INVALID_FORMAT'
      });
    }

    if (query.endDate && !this.validateISODate(query.endDate)) {
      errors.push({
        field: 'endDate',
        message: 'End date must be a valid ISO date string',
        code: 'INVALID_FORMAT'
      });
    }

    if (query.hostId !== undefined) {
      const hostId = Number(query.hostId);
      if (isNaN(hostId) || hostId < 1) {
        errors.push({
          field: 'hostId',
          message: 'Host ID must be a positive integer',
          code: 'INVALID_VALUE'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate event ID parameter
   */
  static validateEventId(eventId: string): ValidationResult {
    const errors: ValidationError[] = [];
    const eventIdNum = parseInt(eventId, 10);

    if (isNaN(eventIdNum) || eventIdNum < 1) {
      errors.push({
        field: 'eventId',
        message: 'Event ID must be a positive integer',
        code: 'INVALID_VALUE'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Middleware to handle validation errors
   */
  static handleValidationErrors(ctx: Context, validationResult: ValidationResult): boolean {
    if (!validationResult.isValid) {
      ctx.status = 400;
      ctx.body = {
        error: 'Validation failed',
        details: 'One or more fields are invalid',
        validationErrors: validationResult.errors
      };
      return false;
    }
    return true;
  }

  /**
   * Sanitize and normalize request data
   */
  static sanitizeEventData(data: any): any {
    const sanitized: any = {};

    if (data.date) {
      sanitized.date = new Date(data.date).toISOString();
    }

    if (data.hostDiscordId) {
      sanitized.hostDiscordId = data.hostDiscordId.trim();
    }

    if (data.cohostDiscordId) {
      sanitized.cohostDiscordId = data.cohostDiscordId.trim();
    }

    return sanitized;
  }

  /**
   * Sanitize squad member data
   */
  static sanitizeSquadMemberData(data: any): any {
    const sanitized: any = {};

    if (data.discordId) {
      sanitized.discordId = data.discordId.trim();
    }

    if (data.isLead !== undefined) {
      sanitized.isLead = Boolean(data.isLead);
    }

    if (data.isLate !== undefined) {
      sanitized.isLate = Boolean(data.isLate);
    }

    if (data.lateNote !== undefined) {
      sanitized.lateNote = data.lateNote ? data.lateNote.trim() : null;
    }

    return sanitized;
  }

  /**
   * Sanitize squad name
   */
  static sanitizeSquadName(squadName: string): string {
    return squadName.trim();
  }
}
