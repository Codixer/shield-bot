import { VRCWebSocket, EventType } from "vrc-ts";
import { vrchatApi } from "../../utility/vrchat/index.js";
import { loggers } from "../../utility/logger.js";
import type { VRChatWebSocketData } from "../../utility/vrchat/types.js";
import {
  handleFriendActive,
  handleFriendDelete,
  handleFriendLocation,
  handleFriendOffline,
  handleFriendOnline,
  handleFriendUpdate,
} from "./handlers/friend/index.js";
import { handleFriendAdd } from "./handlers/friend/handleFriendAdded.js";
// TODO: Implement these handlers when needed
// import { handleUserUpdate } from "./handlers/user/handleUserUpdate.js";
// import { handleUserLocation } from "./handlers/user/handleUserLocation.js";
// import { handleUserBadgeAssigned } from "./handlers/user/handleUserBadgeAssigned.js";
// import { handleUserBadgeUnassigned } from "./handlers/user/handleUserBadgeUnassigned.js";
// import { handleContentRefresh } from "./handlers/user/handleContentRefresh.js";
// import { handleInstanceQueueJoined } from "./handlers/user/handleInstanceQueueJoined.js";
// import { handleGroupJoined } from "./handlers/group/handleGroupJoined.js";
// import { handleGroupLeft } from "./handlers/group/handleGroupLeft.js";
// import { handleGroupRoleUpdated } from "./handlers/group/handleGroupRoleUpdated.js";
import { handleNotification } from "./handlers/notification/notification.js";

// WebSocket instance
let ws: VRCWebSocket | null = null;

/**
 * Stop the VRChat WebSocket listener
 */
export function stopVRChatWebSocketListener() {
  if (ws) {
    try {
      // vrc-ts WebSocket may have different cleanup methods
      // Try to close/cleanup if methods exist
      const wsWithMethods = ws as { close?: () => void; disconnect?: () => void };
      if (typeof wsWithMethods.close === "function") {
        wsWithMethods.close();
      } else if (typeof wsWithMethods.disconnect === "function") {
        wsWithMethods.disconnect();
      }
    } catch (error) {
      loggers.vrchat.error("Error disconnecting WebSocket", error);
    }
    ws = null;
  }
  loggers.vrchat.info("VRChat WebSocket listener stopped");
}

/**
 * Start the VRChat WebSocket listener
 */
export function startVRChatWebSocketListener() {
  // Check if already connected
  if (ws) {
    loggers.vrchat.warn("WebSocket already connected");
    return;
  }

  // Check if API is logged in
  if (!vrchatApi.currentUser) {
    loggers.vrchat.error("Not logged in to VRChat. Please log in first.");
    return;
  }

  try {
    // Create WebSocket instance with vrc-ts
    ws = new VRCWebSocket({
      vrchatAPI: vrchatApi,
      eventsToListenTo: [
        EventType.Friend_Add,
        EventType.Friend_Delete,
        EventType.Friend_Online,
        EventType.Friend_Active,
        EventType.Friend_Offline,
        EventType.Friend_Update,
        EventType.Friend_Location,
        EventType.Notification,
        EventType.Notification_V2,
        // Add other events as needed
      ],
    });

    // Friend Events
    ws.on(EventType.Friend_Add, async (data: unknown) => {
      try {
        // vrc-ts provides data in a structured format
        // Map to our handler's expected format
        const typedData = data as VRChatWebSocketData;
        await handleFriendAdd({
          userId: typedData.user?.id || typedData.userId || "",
          user: typedData.user,
        });
      } catch (err) {
        loggers.vrchat.error("Error handling friend-add", err);
      }
    });

    ws.on(EventType.Friend_Delete, async (data: unknown) => {
      try {
        const typedData = data as VRChatWebSocketData;
        await handleFriendDelete({
          userId: typedData.user?.id || typedData.userId || "",
          user: typedData.user,
        });
      } catch (err) {
        loggers.vrchat.error("Error handling friend-delete", err);
      }
    });

    ws.on(EventType.Friend_Online, async (data: unknown) => {
      try {
        // Map vrc-ts event data to our handler format
        const typedData = data as VRChatWebSocketData;
        await handleFriendOnline({
          userId: typedData.user?.id || typedData.userId || "",
          location: typedData.location,
          worldId: typedData.worldId,
          travelingToLocation: typedData.travelingToLocation,
          user: typedData.user,
        });
      } catch (err) {
        loggers.vrchat.error("Error handling friend-online", err);
      }
    });

    ws.on(EventType.Friend_Active, async (data: unknown) => {
      try {
        const typedData = data as VRChatWebSocketData;
        await handleFriendActive({
          userId: typedData.user?.id || typedData.userId || "",
          location: typedData.location,
          worldId: typedData.worldId,
          user: typedData.user,
        });
      } catch (err) {
        loggers.vrchat.error("Error handling friend-active", err);
      }
    });

    ws.on(EventType.Friend_Offline, async (data: unknown) => {
      try {
        const typedData = data as VRChatWebSocketData;
        await handleFriendOffline({
          userId: typedData.user?.id || typedData.userId || "",
          user: typedData.user,
        });
      } catch (err) {
        loggers.vrchat.error("Error handling friend-offline", err);
      }
    });

    ws.on(EventType.Friend_Update, async (data: unknown) => {
      try {
        const typedData = data as VRChatWebSocketData;
        await handleFriendUpdate({
          userId: typedData.user?.id || typedData.userId || "",
          user: typedData.user,
        });
      } catch (err) {
        loggers.vrchat.error("Error handling friend-update", err);
      }
    });

    ws.on(EventType.Friend_Location, async (data: unknown) => {
      try {
        const typedData = data as VRChatWebSocketData;
        await handleFriendLocation({
          userId: typedData.user?.id || typedData.userId || "",
          location: typedData.location,
          worldId: typedData.worldId,
          travelingToLocation: typedData.travelingToLocation,
          user: typedData.user,
        });
      } catch (err) {
        loggers.vrchat.error("Error handling friend-location", err);
      }
    });

    // Notification Events
    ws.on(EventType.Notification, async (data: unknown) => {
      try {
        // vrc-ts notification format may differ, adapt as needed
        await handleNotification(data);
      } catch (err) {
        loggers.vrchat.error("Error handling notification", err);
      }
    });

    ws.on(EventType.Notification_V2, async (data: unknown) => {
      try {
        // Handle v2 notifications
        await handleNotification(data);
      } catch (err) {
        loggers.vrchat.error("Error handling notification-v2", err);
      }
    });

    // Error handling
    ws.on(EventType.Error, (error: unknown) => {
      loggers.vrchat.error("VRChat WebSocket error", error);
    });

    // Connection events - vrc-ts WebSocket may use different event names
    // The WebSocket should connect automatically when created
    // Listen for connection events if available
    const wsWithEvents = ws as { on?: (event: string, handler: () => void) => void };
    if (typeof wsWithEvents.on === "function") {
      try {
        wsWithEvents.on("open", () => {
          loggers.vrchat.info("Connected to VRChat WebSocket");
        });

        wsWithEvents.on("close", () => {
          loggers.vrchat.warn("VRChat WebSocket disconnected");
          ws = null;
        });
      } catch {
        // Event listeners may not be available in this format
        loggers.vrchat.debug("Could not set up connection event listeners");
      }
    }

    loggers.vrchat.info("VRChat WebSocket listener started");
  } catch (error) {
    loggers.vrchat.error("Failed to start VRChat WebSocket listener", error);
    ws = null;
  }
}