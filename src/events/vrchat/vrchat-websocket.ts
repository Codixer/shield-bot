import WebSocket from "ws";
import { loadCookie } from "../../utility/vrchat.js";

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
            "User-Agent": process.env.USER_AGENT
        }
    });

    ws.on("open", () => {
        console.log("Connected to VRChat WebSocket");
    });

    ws.on("message", (data) => {
        try {
            const msg = JSON.parse(data.toString());
            if (msg.type === "notification") {
                // Double-encoded: content is a stringified JSON
                let content = msg.content;
                try {
                    content = JSON.parse(content);
                } catch {}
                console.log("[VRChat Notification]", content);
            } else {
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