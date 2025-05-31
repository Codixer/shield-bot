import WebSocket from "ws";
import { loadCookie } from "../../utility/vrchat.js";
import { prisma } from "../../main.js";
import { handleFriendAdd } from "./handlers/friend/handleFriendAdd.js";
import { handleFriendDelete } from "./handlers/friend/handleFriendDelete.js";
import { handleFriendLocation } from "./handlers/friend/handleFriendLocation.js";
import { handleFriendOnline } from "./handlers/friend/handleFriendOnline.js";
import { handleFriendActive } from "./handlers/friend/handleFriendActive.js";
import { handleFriendOffline } from "./handlers/friend/handleFriendOffline.js";
import { handleFriendUpdate } from "./handlers/friend/handleFriendUpdate.js";
import { handleUserUpdate } from "./handlers/user/handleUserUpdate.js";
import { handleUserLocation } from "./handlers/user/handleUserLocation.js";
import { handleUserBadgeAssigned } from "./handlers/user/handleUserBadgeAssigned.js";
import { handleUserBadgeUnassigned } from "./handlers/user/handleUserBadgeUnassigned.js";
import { handleContentRefresh } from "./handlers/user/handleContentRefresh.js";
import { handleInstanceQueueJoined } from "./handlers/user/handleInstanceQueueJoined.js";
import { handleGroupJoined } from "./handlers/group/handleGroupJoined.js";
import { handleGroupLeft } from "./handlers/group/handleGroupLeft.js";
import { handleGroupMemberUpdated } from "./handlers/group/handleGroupMemberUpdated.js";
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
        console.error("No VRChat cookie found. Please log in first.");
        return;
    }
    const authToken = getAuthTokenFromCookie(cookie);
    if (!authToken) {
        console.error("No auth token found in cookie.");
        return;
    }
    const wsUrl = `wss://pipeline.vrchat.cloud/?authToken=${authToken}`;
    const ws = new WebSocket(wsUrl, {
        headers: {
            "User-Agent": process.env.VRCHAT_USER_AGENT
        }
    });

    ws.on("open", () => {
        console.log("Connected to VRChat WebSocket");
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
            switch (msg.type) {
                // Notification Events
                case "notification":
                    handleNotification(content);
                    break;
                case "response-notification":
                    handleResponseNotification(content);
                    break;
                case "see-notification":
                    handleSeeNotification(content);
                    break;
                case "hide-notification":
                    handleHideNotification(content);
                    break;
                case "clear-notification":
                    handleClearNotification(content);
                    break;
                case "notification-v2":
                    handleNotificationV2(content);
                    break;
                case "notification-v2-update":
                    handleNotificationV2Update(content);
                    break;
                case "notification-v2-delete":
                    handleNotificationV2Delete(content);
                    break;
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
                // User Events
                case "user-update":
                    await handleUserUpdate(content);
                    break;
                case "user-location":
                    await handleUserLocation(content);
                    break;
                case "user-badge-assigned":
                    await handleUserBadgeAssigned(content);
                    break;
                case "user-badge-unassigned":
                    await handleUserBadgeUnassigned(content);
                    break;
                case "content-refresh":
                    await handleContentRefresh(content);
                    break;
                case "instance-queue-joined":
                    await handleInstanceQueueJoined(content);
                    break;
                case "instance-queue-ready":
                    // TODO: Implement handler for instance-queue-ready
                    console.log("[Instance Queue Ready]", content);
                    break;
                // Group Events
                case "group-joined":
                    await handleGroupJoined(content);
                    break;
                case "group-left":
                    await handleGroupLeft(content);
                    break;
                case "group-member-updated":
                    await handleGroupMemberUpdated(content);
                    break;
                case "group-role-updated":
                    await handleGroupRoleUpdated(content);
                    break;
                default:
                    console.log("[VRChat WS]", msg);
            }
        } catch (err) {
            console.error("Failed to parse VRChat WS message:", err, data.toString());
        }
    });

    ws.on("close", (code, reason) => {
        console.warn(`VRChat WebSocket closed: ${code} ${reason}`);
    });

    ws.on("error", (err) => {
        console.error("VRChat WebSocket error:", err);
    });
}