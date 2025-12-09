// VRChat Calendar API utilities using vrc-ts

import { RequestError, GroupIdType, EventCategoryType, LanguageTypes, PlatformType } from "vrc-ts";
import { vrchatApi } from "./index.js";
import { VRChatError } from "../errors.js";
import { loggers } from "../logger.js";

/**
 * Create a VRChat group calendar event
 * @param groupId The VRChat group ID (e.g., grp_xxx)
 * @param eventData Event data including title, start time, end time, description
 * @returns Promise resolving to the created calendar event with its ID
 * @throws {VRChatError} If the event creation fails
 * 
 * Defaults applied:
 * - category: "roleplay" (if not provided)
 * - languages: English (LanguageTypes.English)
 * - platforms: All platforms (PC, Android, iOS)
 * - roleIds: Empty array (no role restrictions)
 * - sendCreationNotification: true
 */
export async function createVRChatCalendarEvent(
  groupId: string,
  eventData: {
    title: string;
    startsAt: Date | string;
    endsAt?: Date | string;
    description?: string;
    category?: string;
    tags?: string[];
    sendCreationNotification?: boolean;
  },
): Promise<{ id: string; [key: string]: unknown }> {
  try {
    // Convert dates to ISO strings if needed
    const startsAt = eventData.startsAt instanceof Date 
      ? eventData.startsAt.toISOString() 
      : eventData.startsAt;
    
    const endsAt = eventData.endsAt 
      ? (eventData.endsAt instanceof Date 
          ? eventData.endsAt.toISOString() 
          : eventData.endsAt)
      : startsAt; // VRChat requires endsAt, use startsAt if not provided

    // Check if groupApi exists in vrchatApi
    if (!vrchatApi.groupApi) {
      throw new Error("VRChat group API is not available. Please check vrc-ts version.");
    }

    // Map category string to EventCategoryType enum
    // Default to "roleplay" if not provided
    let category: EventCategoryType = EventCategoryType.Roleplaying;
    if (eventData.category) {
      const categoryMap: Record<string, EventCategoryType> = {
        music: EventCategoryType.Music,
        gaming: EventCategoryType.Gaming,
        hangout: EventCategoryType.Hangout,
        exploring: EventCategoryType.Exploring,
        avatars: EventCategoryType.Avatars,
        film_media: EventCategoryType.FilmAndMedia,
        dance: EventCategoryType.Dance,
        roleplaying: EventCategoryType.Roleplaying,
        performance: EventCategoryType.Performance,
      };
      category = categoryMap[eventData.category.toLowerCase()] || EventCategoryType.Roleplaying;
    }

    // Convert tags array - filter out undefined/null values
    // API doesn't accept null/undefined in arrays (they become null in JSON)
    const tagsArray = eventData.tags?.filter((tag): tag is string => Boolean(tag)) || [];
    
    // Default language to English - only include defined values
    // API rejects null/undefined values in arrays
    const filteredLanguages: LanguageTypes[] = [LanguageTypes.English];
    
    // Default platforms to all platforms (PC, Android, iOS)
    // Empty array is also valid, but including all platforms is more inclusive
    const platforms: PlatformType[] = [
      PlatformType.PC_ONLY,
      PlatformType.ANDROID,
      PlatformType.IOS,
    ];

    // Construct tuple types - only include values that actually exist
    // This ensures JSON serialization doesn't include null/undefined values
    // For languages: construct tuple with only defined values (max 3)
    const languagesTuple: [LanguageTypes?, LanguageTypes?, LanguageTypes?] = (() => {
      const result: LanguageTypes[] = [];
      if (filteredLanguages[0]) {
        result.push(filteredLanguages[0]);
      }
      if (filteredLanguages[1]) {
        result.push(filteredLanguages[1]);
      }
      if (filteredLanguages[2]) {
        result.push(filteredLanguages[2]);
      }
      return result as [LanguageTypes?, LanguageTypes?, LanguageTypes?];
    })();
    
    // For tags: construct tuple with only defined values (max 5)
    const tagsTuple: [string?, string?, string?, string?, string?] = (() => {
      const result: string[] = [];
      if (tagsArray[0]) {
        result.push(tagsArray[0]);
      }
      if (tagsArray[1]) {
        result.push(tagsArray[1]);
      }
      if (tagsArray[2]) {
        result.push(tagsArray[2]);
      }
      if (tagsArray[3]) {
        result.push(tagsArray[3]);
      }
      if (tagsArray[4]) {
        result.push(tagsArray[4]);
      }
      return result as [string?, string?, string?, string?, string?];
    })();

    const result = await vrchatApi.groupApi.createGroupEvent({
      groupId: groupId as GroupIdType,
      title: eventData.title,
      startsAt,
      endsAt,
      description: eventData.description || "",
      category,
      platforms,
      roleIds: [], // Empty array is allowed (no role restrictions)
      languages: languagesTuple,
      tags: tagsTuple,
      sendCreationNotification: eventData.sendCreationNotification ?? true,
    });

    // Extract event ID from result
    const resultTyped = result as { id?: string; eventId?: string; [key: string]: unknown };
    const eventId = resultTyped.id || resultTyped.eventId;

    if (!eventId) {
      loggers.vrchat.warn("Created calendar event but could not extract ID from response", { result });
      throw new VRChatError("Failed to extract event ID from VRChat API response", 500, { groupId, result });
    }

    loggers.vrchat.info(`Created VRChat calendar event ${eventId} for group ${groupId}`);
    // Return result with id field (result may already have id, so we ensure it's set)
    return { ...resultTyped, id: eventId };
  } catch (error: unknown) {
    if (error instanceof RequestError) {
      throw new VRChatError(
        `Failed to create calendar event: ${error.statusCode} ${error.message}`,
        error.statusCode,
        { groupId, eventData },
      );
    }
    if (error instanceof VRChatError) {
      throw error;
    }
    throw new VRChatError(
      `Failed to create calendar event: ${error instanceof Error ? error.message : String(error)}`,
      500,
      { groupId, eventData },
    );
  }
}

/**
 * Update a VRChat group calendar event
 * @param groupId The VRChat group ID (e.g., grp_xxx)
 * @param eventId The VRChat calendar event ID
 * @param eventData Updated event data
 * @returns Promise resolving to the updated calendar event
 * @throws {VRChatError} If the event update fails
 */
export async function updateVRChatCalendarEvent(
  groupId: string,
  eventId: string,
  eventData: {
    title?: string;
    startsAt?: Date | string;
    endsAt?: Date | string;
    description?: string;
    category?: string;
    tags?: string[];
  },
): Promise<unknown> {
  try {
    // Convert dates to ISO strings if needed
    const startsAt = eventData.startsAt 
      ? (eventData.startsAt instanceof Date 
          ? eventData.startsAt.toISOString() 
          : eventData.startsAt)
      : undefined;
    
    const endsAt = eventData.endsAt 
      ? (eventData.endsAt instanceof Date 
          ? eventData.endsAt.toISOString() 
          : eventData.endsAt)
      : undefined;

    // Check if groupApi exists in vrchatApi
    if (!vrchatApi.groupApi) {
      throw new Error("VRChat group API is not available. Please check vrc-ts version.");
    }

    // Map category string to EventCategoryType enum if provided
    let category: EventCategoryType | undefined;
    if (eventData.category) {
      const categoryMap: Record<string, EventCategoryType> = {
        music: EventCategoryType.Music,
        gaming: EventCategoryType.Gaming,
        hangout: EventCategoryType.Hangout,
        exploring: EventCategoryType.Exploring,
        avatars: EventCategoryType.Avatars,
        film_media: EventCategoryType.FilmAndMedia,
        dance: EventCategoryType.Dance,
        roleplaying: EventCategoryType.Roleplaying,
        performance: EventCategoryType.Performance,
      };
      category = categoryMap[eventData.category.toLowerCase()];
    }

    // Convert tags array to tuple format (max 5 tags)
    // Filter out undefined/null values - API doesn't accept them
    const tagsArray = eventData.tags?.filter((tag): tag is string => Boolean(tag)) || [];
    const tags: [string?, string?, string?, string?, string?] | undefined = tagsArray.length > 0
      ? [
          tagsArray[0],
          tagsArray[1],
          tagsArray[2],
          tagsArray[3],
          tagsArray[4],
        ]
      : undefined;

    // For updates, we need to provide platforms and roleIds (required fields)
    // Default to all platforms if not specified
    const platforms: PlatformType[] = [
      PlatformType.PC_ONLY,
      PlatformType.ANDROID,
      PlatformType.IOS,
    ];

    // Default language to English if updating (preserve existing if not changing)
    // Since we can't fetch existing event easily, default to English
    // Note: For update, languages is LanguageTypes[] (not tuple)
    // Only include defined values - API doesn't accept null/undefined in array
    const languages: LanguageTypes[] | undefined = [
      LanguageTypes.English,
    ];

    const result = await vrchatApi.groupApi.updateGroupEvent({
      groupId: groupId as GroupIdType,
      eventId: eventId as `cal_${string}-${string}-${string}-${string}-${string}`,
      title: eventData.title,
      startsAt,
      endsAt,
      description: eventData.description,
      category,
      platforms, // Required field - default to all platforms
      roleIds: [], // Required field - empty means no role restrictions
      languages, // Default to English
      tags,
    });

    loggers.vrchat.info(`Updated VRChat calendar event ${eventId} for group ${groupId}`);
    return result;
  } catch (error: unknown) {
    if (error instanceof RequestError) {
      throw new VRChatError(
        `Failed to update calendar event: ${error.statusCode} ${error.message}`,
        error.statusCode,
        { groupId, eventId, eventData },
      );
    }
    if (error instanceof VRChatError) {
      throw error;
    }
    throw new VRChatError(
      `Failed to update calendar event: ${error instanceof Error ? error.message : String(error)}`,
      500,
      { groupId, eventId, eventData },
    );
  }
}

/**
 * Delete a VRChat group calendar event (optional, for future use)
 * @param groupId The VRChat group ID (e.g., grp_xxx)
 * @param eventId The VRChat calendar event ID
 * @returns Promise resolving when deletion is complete
 * @throws {VRChatError} If the event deletion fails
 */
export async function deleteVRChatCalendarEvent(
  groupId: string,
  eventId: string,
): Promise<void> {
  try {
    // Check if groupApi exists in vrchatApi
    if (!vrchatApi.groupApi) {
      throw new Error("VRChat group API is not available. Please check vrc-ts version.");
    }

    await vrchatApi.groupApi.deleteGroupEvent({
      groupId: groupId as GroupIdType,
      eventId: eventId as `cal_${string}-${string}-${string}-${string}-${string}`,
    });

    loggers.vrchat.info(`Deleted VRChat calendar event ${eventId} for group ${groupId}`);
  } catch (error: unknown) {
    if (error instanceof RequestError) {
      throw new VRChatError(
        `Failed to delete calendar event: ${error.statusCode} ${error.message}`,
        error.statusCode,
        { groupId, eventId },
      );
    }
    if (error instanceof VRChatError) {
      throw error;
    }
    throw new VRChatError(
      `Failed to delete calendar event: ${error instanceof Error ? error.message : String(error)}`,
      500,
      { groupId, eventId },
    );
  }
}
