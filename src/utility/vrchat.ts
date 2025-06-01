import vrchat from "vrchat";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { authenticator } from "otplib";
import fetch from "node-fetch";
import { prisma } from "../main.js";

/**
 * Send a friend request to a VRChat user by userId.
 * If already friends (400 error), unfriend and try again.
 * @param {string} userId - The VRChat user ID to friend.
 * @returns {Promise<object>} The friend request response.
 */
export async function sendFriendRequest(userId: string): Promise<object> {
    const cookie = loadCookie();
    if (!cookie) throw new Error("Not authenticated. Please log in first.");
    const url = `https://api.vrchat.cloud/api/1/user/${userId}/friendRequest`;
    const headers = {
        "Cookie": cookie,
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json"
    };
    let res = await fetch(url, {
        method: "POST",
        headers
    });
    if (res.status === 400) {
        // Already friends, unfriend and try again
        await unfriendUser(userId);
        res = await fetch(url, {
            method: "POST",
            headers
        });
    }
    if (!res.ok) {
        throw new Error(`Failed to send friend request: ${res.status} ${await res.text()}`);
    }
    return await res.json();
}

/**
 * Unfriend a VRChat user by userId.
 * @param {string} userId - The VRChat user ID to unfriend.
 * @returns {Promise<object>} The unfriend response.
 */
export async function unfriendUser(userId: string): Promise<object> {
    const cookie = loadCookie();
    if (!cookie) throw new Error("Not authenticated. Please log in first.");
    const url = `https://api.vrchat.cloud/api/1/auth/user/friends/${userId}`;
    const headers = {
        "Cookie": cookie,
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json"
    };
    const res = await fetch(url, {
        method: "DELETE",
        headers
    });
    if (!res.ok) {
        throw new Error(`Failed to unfriend user: ${res.status} ${await res.text()}`);
    }
    return await res.json();
}

const USER_AGENT = process.env.VRCHAT_USER_AGENT || "SomethingBrokeWithMyEnvFileSorry/0.0.1 contact@stefanocoding.me";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIE_DIR = path.resolve(__dirname, "../../.vrchat_cookies");
const COOKIE_FILE = path.join(COOKIE_DIR, "cookie.json");

function saveCookie(cookie: string) {
    if (!fs.existsSync(COOKIE_DIR)) fs.mkdirSync(COOKIE_DIR, { recursive: true });
    fs.writeFileSync(COOKIE_FILE, JSON.stringify({ cookie }), "utf-8");
}

// Export loadCookie for use in websocket listener
export function loadCookie(): string | null {
    if (fs.existsSync(COOKIE_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(COOKIE_FILE, "utf-8"));
            return data.cookie;
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * Logs in to VRChat (if not already logged in) and returns the current user info.
 * Stores the session cookie for reuse.
 *
 * @param username VRChat username
 * @param password VRChat password
 * @returns Current user info object from VRChat API
 */
export async function loginAndGetCurrentUser(username: string, password: string) {
    let cookie = loadCookie();
    let headers: any = { "User-Agent": USER_AGENT };
    if (cookie) headers["Cookie"] = cookie;

    // Try with cookie first
    try {
        const response = await axios.get("https://api.vrchat.cloud/api/1/auth/user", { headers });
        const setCookie = response.headers["set-cookie"];
        if (setCookie && setCookie.length > 0) saveCookie(setCookie.join("; "));
        return response.data;
    } catch (err: any) {
        if (!err.response || err.response.status !== 401) {
            throw err;
        }
    }

    // If unauthorized, try login with credentials
    const encode = (str: string) => encodeURIComponent(str);
    const credentials = Buffer.from(`${encode(username)}:${encode(password)}`).toString("base64");
    headers["Authorization"] = `Basic ${credentials}`;
    let response = await axios.get("https://api.vrchat.cloud/api/1/auth/user", { headers });

    // If no 2FA required, save cookie and return
    if (!response.data.requiresTwoFactorAuth) {
        const setCookie = response.headers["set-cookie"];
        if (setCookie && setCookie.length > 0) {
            const authCookie = setCookie.find((c: string) => c.startsWith("auth="));
            if (authCookie) saveCookie(authCookie.split(";")[0]);
            else saveCookie(setCookie.join("; "));
        }
        return response.data;
    }

    // 2FA required
    const methods = response.data.requiresTwoFactorAuth;
    if (methods.includes("emailOtp") && !methods.includes("otp") && !methods.includes("totp")) {
        throw new Error("Login refused: Only emailOtp is supported for this account, shutting down.");
    }
    if (!(methods.includes("otp") || methods.includes("totp"))) {
        throw new Error("2FA required but no supported method (otp/totp) available");
    }
    const otpToken = process.env.VRCHAT_OTP_TOKEN;
    if (!otpToken) throw new Error("VRCHAT_OTP_TOKEN env variable not set");
    const code = authenticator.generate(otpToken);
    let allCookiesArr: string[] = [];
    const setCookie = response.headers["set-cookie"];
    if (setCookie && setCookie.length > 0) {
        allCookiesArr = setCookie.map((c: string) => c.split(';')[0]);
    }
    let authCookie = allCookiesArr.find((c: string) => c.startsWith("auth="));
    if (!authCookie) throw new Error("No auth cookie found for 2FA verification");
    const cookieHeader = authCookie;
    const verifyRes = await axios.post(
        "https://api.vrchat.cloud/api/1/auth/twofactorauth/totp/verify",
        { code },
        {
            headers: {
                ...headers,
                "Content-Type": "application/json",
                "Cookie": cookieHeader,
                "User-Agent": USER_AGENT
            },
            withCredentials: true
        }
    );
    const verifySetCookie = verifyRes.headers["set-cookie"];
    let finalCookies = allCookiesArr;
    if (verifySetCookie && verifySetCookie.length > 0) {
        const twoFactorCookie = verifySetCookie.find((c: string) => c.startsWith("twoFactorAuth="));
        if (twoFactorCookie) finalCookies.push(twoFactorCookie.split(";")[0]);
    }
    saveCookie(finalCookies.join("; "));
    if (!verifyRes.data.verified) {
        throw new Error("2FA verification failed");
    }
    return verifyRes.data;
}

/**
 * Checks if the current session is logged in and 2FA verified.
 * @returns true if logged in and verified, false otherwise
 */
export async function isLoggedInAndVerified() {
    const cookie = loadCookie();
    if (!cookie) return false;
    try {
        const headers = { "User-Agent": USER_AGENT, "Cookie": cookie };
        const response = await axios.get("https://api.vrchat.cloud/api/1/auth/user", { headers });
        const user = response.data;
        if (!user || !user.id) return false;
        if (user.has2FA && user.has2FAEmail && user.emailVerified) return true;
        if (!user.has2FA && user.id) return true;
        return false;
    } catch {
        return false;
    }
}

/**
 * Searches for VRChat users by display name.
 * @param search The display name to search for (required)
 * @param n Number of results to return (default 60, min 1, max 100)
 * @param offset Zero-based offset for pagination (default 0)
 * @returns Array of LimitedUser objects
 */
export async function searchUsers({
    search,
    n = 60,
    offset = 0
}: {
    search: string;
    n?: number;
    offset?: number;
    developerType?: string;
}) {
    if (!search) throw new Error("Search query is required");
    const cookie = loadCookie();
    if (!cookie) throw new Error("Not authenticated. Please log in first.");
    const headers = {
        "User-Agent": USER_AGENT,
        "Cookie": cookie
    };
    const params = new URLSearchParams({
        search,
        n: n.toString(),
        offset: offset.toString()
    });
    const url = `https://api.vrchat.cloud/api/1/users?${params.toString()}`;
    const response = await axios.get(url, { headers });
    return response.data;
}

/**
 * Accept a friend request by notification ID using the VRChat API.
 * @param notificationId The notification ID (frq_...)
 * @param authToken The VRChat auth token (cookie value)
 */
export async function acceptFriendRequest(notificationId: string) {
    const cookie = loadCookie();
    if (!cookie) throw new Error("Not authenticated. Please log in first.");
    
    const url = `https://api.vrchat.cloud/api/1/auth/user/notifications/${notificationId}/accept`;
    const response = await fetch(url, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
            "Cookie": cookie,
        },

    });
    if (!response.ok) {
        throw new Error(`Failed to accept friend request: ${response.status} ${response.statusText}`);
    }
    return await response.json();
}

/**
 * Finds the instance or world for a given userId from the friendLocation table.
 * @param userId The VRChat userId to look up
 * @returns The friend location record, or null if not found
 */
export async function findFriendInstanceOrWorld(userId: string) {
    const record = await prisma.friendLocation.findUnique({
        where: { vrcUserId: userId }
    });
    if (!record) {
        console.log(`[VRChat Friend Lookup] User not tracked: ${userId}`);
        return null;
    }
    return record;
}

/**
 * Gets instance information for a userId, if available in the database and not a special value.
 * @param userId The VRChat userId to look up
 * @returns The instance info from the VRChat API, or null if not available or not tracked
 */
export async function getFriendInstanceInfo(userId: string) {
    const record = await findFriendInstanceOrWorld(userId);
    if (!record) return null;
    // Handle special values
    if (!record.worldId || !record.location || record.location === "offline" || record.location === "travelling" || record.location === "traveling") {
        console.log(`[VRChat Instance Lookup] User ${userId} is not in a public instance (location: ${record.location})`);
        return null;
    }
    // Special handling for private location with worldId and senderUserId
    if (record.location === "private" && record.worldId && record.senderUserId) {
        // record.worldId is a full instance URL (worlduuid:instanceUuid~...)
        const cookie = loadCookie();
        if (!cookie) throw new Error("Not authenticated. Please log in first.");
        const url = `https://api.vrchat.cloud/api/1/instances/${record.worldId}`;
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": USER_AGENT,
                "Cookie": cookie,
                "Content-Type": "application/json"
            }
        });
        if (!response.ok) {
            if (response.status === 404) {
                console.log(`[VRChat Instance Lookup] Private instance not found for user ${userId}`);
                return null;
            }
            throw new Error(`Failed to fetch private instance info: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (!data) {
            console.log(`[VRChat Instance Lookup] Private instance info is null for user ${userId}`);
            return null;
        }
        return data;
    }
    // The location is usually in the form worldId:instanceId or just instanceId
    let worldId = record.worldId;
    let instanceId = null;
    if (record.location.includes(":")) {
        const parts = record.location.split(":");
        worldId = parts[0];
        instanceId = parts[1];
    } else {
        instanceId = record.location;
    }
    if (!worldId || !instanceId) {
        console.log(`[VRChat Instance Lookup] Could not parse worldId/instanceId for user ${userId}`);
        return null;
    }
    const cookie = loadCookie();
    if (!cookie) throw new Error("Not authenticated. Please log in first.");
    const url = `https://api.vrchat.cloud/api/1/instances/${worldId}:${instanceId}`;
    const response = await fetch(url, {
        method: "GET",
        headers: {
            "User-Agent": USER_AGENT,
            "Cookie": cookie,
            "Content-Type": "application/json"
        }
    });
    if (!response.ok) {
        if (response.status === 404) {
            console.log(`[VRChat Instance Lookup] Instance not found for user ${userId}`);
            return null;
        }
        throw new Error(`Failed to fetch instance info: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (!data) {
        console.log(`[VRChat Instance Lookup] Instance info is null for user ${userId}`);
        return null;
    }
    return data;
}

/**
 * Gets instance information by shortName (shortcode) from the VRChat API.
 * @param shortName The instance short name
 * @returns The instance info from the VRChat API, or null if not found
 */
export async function getInstanceInfoByShortName(shortName: string) {
    if (!shortName) {
        console.log("[VRChat Instance Lookup] No shortName provided");
        return null;
    }
    const cookie = loadCookie();
    if (!cookie) throw new Error("Not authenticated. Please log in first.");
    const url = `https://api.vrchat.cloud/api/1/instances/s/${shortName}`;
    const response = await fetch(url, {
        method: "GET",
        headers: {
            "User-Agent": USER_AGENT,
            "Cookie": cookie,
            "Content-Type": "application/json"
        }
    });
    if (!response.ok) {
        if (response.status === 404) {
            console.log(`[VRChat Instance Lookup] Instance not found for shortName ${shortName}`);
            return null;
        }
        throw new Error(`Failed to fetch instance info by shortName: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (!data) {
        console.log(`[VRChat Instance Lookup] Instance info is null for shortName ${shortName}`);
        return null;
    }
    return data;
}

/**
 * Get public user information about a specific VRChat user by their ID.
 * @param userId The VRChat user ID (e.g., usr_xxx)
 * @returns The user object from the VRChat API, or null if not found
 */
export async function getUserById(userId: string) {
    if (!userId) throw new Error("User ID is required");
    const cookie = loadCookie();
    if (!cookie) throw new Error("Not authenticated. Please log in first.");
    const headers = {
        "User-Agent": USER_AGENT,
        "Cookie": cookie,
        "Content-Type": "application/json"
    };
    const url = `https://api.vrchat.cloud/api/1/users/${encodeURIComponent(userId)}`;
    try {
        const response = await axios.get(url, { headers });
        return response.data;
    } catch (e: any) {
        if (e.response && e.response.status === 404) return null;
        throw e;
    }
}

/**
 * Checks if a user (allowedVrcUserId) has consent to track another user's (ownerVrcUserId) location.
 * @param ownerVrcUserId The VRChat user ID of the person being tracked
 * @param allowedVrcUserId The VRChat user ID of the person requesting tracking
 * @returns true if consent exists, false otherwise
 */
export async function hasFriendLocationConsent(ownerVrcUserId: string, allowedVrcUserId: string): Promise<boolean> {
    const consent = await prisma.friendLocationConsent.findUnique({
        where: {
            ownerVrcUserId_allowedVrcUserId: {
                ownerVrcUserId,
                allowedVrcUserId
            }
        }
    });
    return !!consent;
}





