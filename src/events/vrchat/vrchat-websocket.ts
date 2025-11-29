import { VRCWebSocket, EventType } from "vrc-ts";
import { vrchatApi } from "../../utility/vrchatClient.js";
import {
  handleFriendActive,
  handleFriendDelete,
  handleFriendLocation,
  handleFriendOffline,
  handleFriendOnline,
  handleFriendUpdate,
} from "./handlers/friend/index.js";
import { handleFriendAdd } from "./handlers/friend/handleFriendAdded.js";
import { handleNotification } from "./handlers/notification/notification.js";

export function startVRChatWebSocketListener() {
  const botUserId = "usr_c3c58aa6-c4dc-4de7-80a6-6826be9327ff";

  // Helper to check if event should be ignored (from bot user)
  function shouldIgnoreEvent(content: any): boolean {
    if (!content) return false;
    if (content.userId === botUserId || content.senderUserId === botUserId) {
      return true;
    }
    if (Array.isArray(content) && content.some(
      (e) => e.userId === botUserId || e.senderUserId === botUserId
    )) {
      return true;
    }
    return false;
  }

  // Create VRCWebSocket instance using vrc-ts
  const websocket = new VRCWebSocket({
    vrchatAPI: vrchatApi,
    eventsToListenTo: [
      EventType.Notification,
      EventType.Friend_Add,
      EventType.Friend_Delete,
      EventType.Friend_Online,
      EventType.Friend_Active,
      EventType.Friend_Offline,
      EventType.Friend_Update,
      EventType.Friend_Location,
    ],
  });

  // Set up event listeners using vrc-ts event system
  websocket.on(EventType.Notification, (data: any) => {
    if (shouldIgnoreEvent(data)) {
      console.debug(`[VRChat WS] Ignoring notification event from bot user`);
      return;
    }
    handleNotification(data);
  });

  websocket.on(EventType.Friend_Add, async (data: any) => {
    if (shouldIgnoreEvent(data)) {
      console.debug(`[VRChat WS] Ignoring friend-add event from bot user`);
      return;
    }
    await handleFriendAdd(data);
  });

  websocket.on(EventType.Friend_Delete, async (data: any) => {
    if (shouldIgnoreEvent(data)) {
      console.debug(`[VRChat WS] Ignoring friend-delete event from bot user`);
      return;
    }
    await handleFriendDelete(data);
  });

  websocket.on(EventType.Friend_Online, async (data: any) => {
    if (shouldIgnoreEvent(data)) {
      console.debug(`[VRChat WS] Ignoring friend-online event from bot user`);
      return;
    }
    await handleFriendOnline(data);
  });

  websocket.on(EventType.Friend_Active, async (data: any) => {
    if (shouldIgnoreEvent(data)) {
      console.debug(`[VRChat WS] Ignoring friend-active event from bot user`);
      return;
    }
    await handleFriendActive(data);
  });

  websocket.on(EventType.Friend_Offline, async (data: any) => {
    if (shouldIgnoreEvent(data)) {
      console.debug(`[VRChat WS] Ignoring friend-offline event from bot user`);
      return;
    }
    await handleFriendOffline(data);
  });

  websocket.on(EventType.Friend_Update, async (data: any) => {
    if (shouldIgnoreEvent(data)) {
      console.debug(`[VRChat WS] Ignoring friend-update event from bot user`);
      return;
    }
    await handleFriendUpdate(data);
  });

  websocket.on(EventType.Friend_Location, async (data: any) => {
    if (shouldIgnoreEvent(data)) {
      console.debug(`[VRChat WS] Ignoring friend-location event from bot user`);
      return;
    }
    await handleFriendLocation(data);
  });

  // Connection event handlers
  websocket.on("open", () => {
    console.log("[WS] Connected to VRChat WebSocket");
  });

  websocket.on("close", () => {
    console.warn("[WS] VRChat WebSocket closed");
  });

  websocket.on("error", (err: Error) => {
    console.error("[WS] VRChat WebSocket error:", err);
  });

  // The websocket automatically connects when instantiated (via super() call in constructor)
  // But we need to ensure the API is authenticated first
  // The connection will happen automatically, but we should verify it's ready
  console.log("[WS] VRChat WebSocket listener started");
  
  // Return the websocket instance so it can be managed if needed
  return websocket;
}
