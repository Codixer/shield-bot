import { VRCWebSocket, EventType } from "vrc-ts";
import { vrchatApi } from "../../utility/vrchat/index.js";
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
      if (typeof (ws as any).close === "function") {
        (ws as any).close();
      } else if (typeof (ws as any).disconnect === "function") {
        (ws as any).disconnect();
      }
    } catch (error) {
      console.error("[WS] Error disconnecting WebSocket:", error);
    }
    ws = null;
  }
  console.log("[WS] VRChat WebSocket listener stopped");
}

/**
 * Start the VRChat WebSocket listener
 */
export function startVRChatWebSocketListener() {
  // Check if already connected
  if (ws) {
    console.warn("[WS] WebSocket already connected");
    return;
  }

  // Check if API is logged in
  if (!vrchatApi.currentUser) {
    console.error("[WS] Not logged in to VRChat. Please log in first.");
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
    ws.on(EventType.Friend_Add, async (data: any) => {
      try {
        // vrc-ts provides data in a structured format
        // Map to our handler's expected format
        await handleFriendAdd({
          userId: data.user?.id || data.userId,
          user: data.user,
        });
      } catch (err) {
        console.error("[WS] Error handling friend-add:", err);
      }
    });

    ws.on(EventType.Friend_Delete, async (data: any) => {
      try {
        await handleFriendDelete({
          userId: data.user?.id || data.userId,
          user: data.user,
        });
      } catch (err) {
        console.error("[WS] Error handling friend-delete:", err);
      }
    });

    ws.on(EventType.Friend_Online, async (data: any) => {
      try {
        // Map vrc-ts event data to our handler format
        await handleFriendOnline({
          userId: data.user?.id || data.userId,
          location: data.location,
          worldId: data.worldId,
          travelingToLocation: data.travelingToLocation,
          user: data.user,
        });
      } catch (err) {
        console.error("[WS] Error handling friend-online:", err);
      }
    });

    ws.on(EventType.Friend_Active, async (data: any) => {
      try {
        await handleFriendActive({
          userId: data.user?.id || data.userId,
          location: data.location,
          worldId: data.worldId,
          user: data.user,
        });
      } catch (err) {
        console.error("[WS] Error handling friend-active:", err);
      }
    });

    ws.on(EventType.Friend_Offline, async (data: any) => {
      try {
        await handleFriendOffline({
          userId: data.user?.id || data.userId,
          user: data.user,
        });
      } catch (err) {
        console.error("[WS] Error handling friend-offline:", err);
      }
    });

    ws.on(EventType.Friend_Update, async (data: any) => {
      try {
        await handleFriendUpdate({
          userId: data.user?.id || data.userId,
          user: data.user,
        });
      } catch (err) {
        console.error("[WS] Error handling friend-update:", err);
      }
    });

    ws.on(EventType.Friend_Location, async (data: any) => {
      try {
        await handleFriendLocation({
          userId: data.user?.id || data.userId,
          location: data.location,
          worldId: data.worldId,
          travelingToLocation: data.travelingToLocation,
          user: data.user,
        });
      } catch (err) {
        console.error("[WS] Error handling friend-location:", err);
      }
    });

    // Notification Events
    ws.on(EventType.Notification, async (data: any) => {
      try {
        // vrc-ts notification format may differ, adapt as needed
        await handleNotification(data);
      } catch (err) {
        console.error("[WS] Error handling notification:", err);
      }
    });

    ws.on(EventType.Notification_V2, async (data: any) => {
      try {
        // Handle v2 notifications
        await handleNotification(data);
      } catch (err) {
        console.error("[WS] Error handling notification-v2:", err);
      }
    });

    // Error handling
    ws.on(EventType.Error, (error: any) => {
      console.error("[WS] VRChat WebSocket error:", error);
    });

    // Connection events - vrc-ts WebSocket may use different event names
    // The WebSocket should connect automatically when created
    // Listen for connection events if available
    if (typeof (ws as any).on === "function") {
      try {
        (ws as any).on("open", () => {
          console.log("[WS] Connected to VRChat WebSocket");
        });

        (ws as any).on("close", () => {
          console.warn("[WS] VRChat WebSocket disconnected");
          ws = null;
        });
      } catch (error) {
        // Event listeners may not be available in this format
        console.debug("[WS] Could not set up connection event listeners");
      }
    }

    console.log("[WS] VRChat WebSocket listener started");
  } catch (error) {
    console.error("[WS] Failed to start VRChat WebSocket listener:", error);
    ws = null;
  }
}