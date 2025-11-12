import WebSocket from "ws";
import { loadCookie } from "../../utility/vrchat.js";
import {
  handleFriendActive,
  handleFriendDelete,
  handleFriendLocation,
  handleFriendOffline,
  handleFriendOnline,
  handleFriendUpdate,
} from "./handlers/friend/index.js";
import { handleFriendAdd } from "./handlers/friend/handleFriendAdded.js";
import { handleUserUpdate } from "./handlers/user/handleUserUpdate.js";
import { handleUserLocation } from "./handlers/user/handleUserLocation.js";
import { handleUserBadgeAssigned } from "./handlers/user/handleUserBadgeAssigned.js";
import { handleUserBadgeUnassigned } from "./handlers/user/handleUserBadgeUnassigned.js";
import { handleContentRefresh } from "./handlers/user/handleContentRefresh.js";
import { handleInstanceQueueJoined } from "./handlers/user/handleInstanceQueueJoined.js";
import { handleGroupJoined } from "./handlers/group/handleGroupJoined.js";
import { handleGroupLeft } from "./handlers/group/handleGroupLeft.js";
// import { handleGroupMemberUpdated } from "./handlers/group/handleGroupMemberUpdated.js";
import { handleGroupRoleUpdated } from "./handlers/group/handleGroupRoleUpdated.js";
import { handleNotification } from "./handlers/notification/notification.js";
import { handleResponseNotification } from "./handlers/notification/response-notification.js";
import { handleSeeNotification } from "./handlers/notification/see-notification.js";
import { handleHideNotification } from "./handlers/notification/hide-notification.js";
import { handleClearNotification } from "./handlers/notification/clear-notification.js";
import { handleNotificationV2 } from "./handlers/notification/notification-v2.js";
import { handleNotificationV2Update } from "./handlers/notification/notification-v2-update.js";
import { handleNotificationV2Delete } from "./handlers/notification/notification-v2-delete.js";

function getAuthTokenFromCookie(cookie: string): string | null {
  // VRChat cookie format: auth=authcookie_xxx; ...
  const match = cookie.match(/auth=([^;]+)/);
  return match ? match[1] : null;
}

export function startVRChatWebSocketListener() {
  const cookie = loadCookie();
  if (!cookie) {
    console.error("[WS] No VRChat cookie found. Please log in first.");
    return;
  }
  const authToken = getAuthTokenFromCookie(cookie);
  if (!authToken) {
    console.error("[WS] No auth token found in cookie.");
    return;
  }
  const wsUrl = `wss://pipeline.vrchat.cloud/?authToken=${authToken}`;
  let ws: WebSocket | null = null;
  let reconnectTimeout: NodeJS.Timeout | null = null;
  let shouldReconnect = true;
  let reconnectAttempts = 0;
  let baseReconnectDelay = 5000; // 5 seconds
  let maxReconnectDelay = 15 * 60 * 1000; // 15 minutes
  let maintenanceMode = false;

  function getReconnectDelay(): number {
    if (maintenanceMode) {
      return maxReconnectDelay; // 15 minutes during maintenance
    }
    
    // Exponential backoff: 5s, 10s, 20s, 40s, 80s, then cap at 15 minutes
    const delay = Math.min(baseReconnectDelay * Math.pow(2, reconnectAttempts), maxReconnectDelay);
    return delay;
  }

  function connect() {
    ws = new WebSocket(wsUrl, {
      headers: {
        "User-Agent": process.env.VRCHAT_USER_AGENT,
      },
    });

    ws.on("open", () => {
      console.log("[WS] Connected to VRChat WebSocket");
      // Reset reconnection state on successful connection
      reconnectAttempts = 0;
      maintenanceMode = false;
    });

    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        let content = msg.content;
        // Double-encoded: content is a stringified JSON for some events
        if (typeof content === "string") {
          try {
            content = JSON.parse(content);
          } catch {
            // If parsing fails, keep as string
          }
        }
        // Ignore events from the bot user
        const botUserId = "usr_c3c58aa6-c4dc-4de7-80a6-6826be9327ff";
        if (
          (content &&
            (content.userId === botUserId ||
              content.senderUserId === botUserId)) ||
          (Array.isArray(content) &&
            content.some(
              (e) => e.userId === botUserId || e.senderUserId === botUserId,
            ))
        ) {
          console.debug(`[VRChat WS] Ignoring ${msg.type} event from bot user`);
          return;
        }

        console.log (`[VRChat WS] Received event: ${msg}`);
        switch (msg.type) {
          // Notification Events
          case "notification":
            handleNotification(content);
            break;
          // case "response-notification":
          //     handleResponseNotification(content);
          //     break;
          // case "see-notification":
          //     handleSeeNotification(content);
          //     break;
          // case "hide-notification":
          //     handleHideNotification(content);
          //     break;
          // case "clear-notification":
          //     handleClearNotification(content);
          //     break;
          // case "notification-v2":
          //     handleNotificationV2(content);
          //     break;
          // case "notification-v2-update":
          //     handleNotificationV2Update(content);
          //     break;
          // case "notification-v2-delete":
          //     handleNotificationV2Delete(content);
          //     break;
          // Friend Events
          case "friend-add":
            await handleFriendAdd(content);
            break;
          case "friend-delete":
            await handleFriendDelete(content);
            break;
          case "friend-online":
            await handleFriendOnline(content);
            break;
          case "friend-active":
            await handleFriendActive(content);
            break;
          case "friend-offline":
            await handleFriendOffline(content);
            break;
          case "friend-update":
            await handleFriendUpdate(content);
            break;
          case "friend-location":
            await handleFriendLocation(content);
            break;
          // // User Events
          // case "user-update":
          //     await handleUserUpdate(content);
          //     break;
          // case "user-location":
          //     await handleUserLocation(content);
          //     break;
          // case "user-badge-assigned":
          //     await handleUserBadgeAssigned(content);
          //     break;
          // case "user-badge-unassigned":
          //     await handleUserBadgeUnassigned(content);
          //     break;
          // case "content-refresh":
          //     await handleContentRefresh(content);
          //     break;
          // case "instance-queue-joined":
          //     await handleInstanceQueueJoined(content);
          //     break;
          // case "instance-queue-ready":
          //     // TODO: Implement handler for instance-queue-ready
          //     console.log("[Instance Queue Ready]", content);
          //     break;
          // Group Events
          case "group-joined":
            await handleGroupJoined(content);
            break;
          case "group-left":
            await handleGroupLeft(content);
            break;
          // case "group-member-updated":
          //   // This event is for the local user (bot) only, not other members
          //   await handleGroupMemberUpdated(content);
          //   break;
          // case "group-role-updated":
          //     await handleGroupRoleUpdated(content);
          //     break;
          default:
            console.debug("[VRChat WS]", msg);
        }
      } catch (err) {
        console.error(
          "[WS]     Failed to parse VRChat WS message:",
          err,
          data.toString(),
        );
      }
    });

    ws.on("close", (code, reason) => {
      console.warn(`[WS] VRChat WebSocket closed: ${code} ${reason}`);
      
      // Check if this is a maintenance-related closure
      if (code === 1006 && maintenanceMode) {
        console.log("[WS] Detected maintenance mode, using extended retry delay");
      }
      
      if (shouldReconnect && !reconnectTimeout) {
        const delay = getReconnectDelay();
        reconnectAttempts++;
        
        console.log(`[WS] Scheduling reconnection attempt ${reconnectAttempts} in ${delay / 1000}s ${maintenanceMode ? '(maintenance mode)' : ''}`);
        
        reconnectTimeout = setTimeout(() => {
          reconnectTimeout = null;
          console.log("[WS] Reconnecting to VRChat WebSocket...");
          connect();
        }, delay);
      }
    });

    ws.on("error", (err) => {
      console.error("[WS] VRChat WebSocket error:", err);
      
      // Check if this is a 503 (Service Unavailable) error indicating maintenance
      if (err.message && (err.message.includes("503") || err.message.includes("Unexpected server response: 503"))) {
        console.log("[WS] Detected 503 error - VRChat appears to be in maintenance mode");
        maintenanceMode = true;
      }
      
      if (shouldReconnect && !reconnectTimeout) {
        const delay = getReconnectDelay();
        reconnectAttempts++;
        
        console.log(`[WS] Scheduling reconnection attempt ${reconnectAttempts} in ${delay / 1000}s after error ${maintenanceMode ? '(maintenance mode)' : ''}`);
        
        reconnectTimeout = setTimeout(() => {
          reconnectTimeout = null;
          console.log("[WS] Reconnecting to VRChat WebSocket after error...");
          connect();
        }, delay);
      }
    });
  }

  connect();
}
