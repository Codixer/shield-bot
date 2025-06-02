// Location/instance–related VRChat API methods

import { prisma } from "../../main.js";
import { loadCookie, USER_AGENT } from "../vrchat/index.js";
import fetch from "node-fetch";

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
