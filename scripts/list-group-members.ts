#!/usr/bin/env ts-node-esm
/**
 * Quick and dirty script to list all VRChat group members and their roles
 * Run with: ts-node-esm scripts/list-group-members.ts
 */

import "dotenv/config";
import axios from "axios";
import { authenticator } from "otplib";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_AGENT = process.env.VRCHAT_USER_AGENT || "GroupMemberScript/1.0.0 contact@example.com";
const COOKIE_DIR = path.resolve(__dirname, "../.vrchat_cookies");
const COOKIE_FILE = path.join(COOKIE_DIR, "cookie.json");

// ===== Cookie Management =====
function saveCookie(cookie: string) {
  if (!fs.existsSync(COOKIE_DIR)) fs.mkdirSync(COOKIE_DIR, { recursive: true });
  fs.writeFileSync(COOKIE_FILE, JSON.stringify({ cookie }), "utf-8");
}

function loadCookie(): string | null {
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

// ===== Authentication =====
async function loginToVRChat(username: string, password: string) {
  let cookie = loadCookie();
  let headers: any = { "User-Agent": USER_AGENT };
  if (cookie) headers["Cookie"] = cookie;

  // Try with cookie first
  try {
    const response = await axios.get("https://api.vrchat.cloud/api/1/auth/user", { headers });
    const setCookie = response.headers["set-cookie"];
    if (setCookie && setCookie.length > 0) saveCookie(setCookie.join("; "));
    console.log("✓ Logged in with existing cookie");
    return response.data;
  } catch (err: any) {
    if (!err.response || err.response.status !== 401) {
      throw err;
    }
  }

  // If unauthorized, try login with credentials
  console.log("⟳ Logging in with credentials...");
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
    console.log("✓ Logged in successfully");
    return response.data;
  }

  // 2FA required
  const methods = response.data.requiresTwoFactorAuth;
  if (methods.includes("emailOtp") && !methods.includes("otp") && !methods.includes("totp")) {
    throw new Error("Login refused: Only emailOtp is supported for this account.");
  }
  if (!(methods.includes("otp") || methods.includes("totp"))) {
    throw new Error("2FA required but no supported method (otp/totp) available");
  }
  
  const otpToken = process.env.VRCHAT_OTP_TOKEN;
  if (!otpToken) throw new Error("VRCHAT_OTP_TOKEN env variable not set");
  
  console.log("⟳ Verifying 2FA...");
  const code = authenticator.generate(otpToken);
  let allCookiesArr: string[] = [];
  const setCookie = response.headers["set-cookie"];
  if (setCookie && setCookie.length > 0) {
    allCookiesArr = setCookie.map((c: string) => c.split(";")[0]);
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
        Cookie: cookieHeader,
        "User-Agent": USER_AGENT,
      },
      withCredentials: true,
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
  
  console.log("✓ 2FA verified successfully");
  return verifyRes.data;
}

// ===== API Calls =====
interface GroupRole {
  id: string;
  groupId: string;
  name: string;
  description: string;
  order: number;
}

interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  roleIds: string[];
  user: {
    id: string;
    displayName: string;
    thumbnailUrl?: string;
  };
  joinedAt: string;
  membershipStatus: string;
}

async function getGroupRoles(groupId: string): Promise<GroupRole[]> {
  const cookie = loadCookie();
  if (!cookie) throw new Error("Not authenticated");

  const url = `https://api.vrchat.cloud/api/1/groups/${groupId}/roles`;
  const response = await axios.get(url, {
    headers: {
      Cookie: cookie,
      "User-Agent": USER_AGENT,
    },
  });

  return response.data;
}

async function getGroupMembers(groupId: string, roleId?: string): Promise<GroupMember[]> {
  const cookie = loadCookie();
  if (!cookie) throw new Error("Not authenticated");

  const allMembers: GroupMember[] = [];
  let offset = 0;
  const limit = 100; // Max allowed per request

  while (true) {
    const params = new URLSearchParams({
      n: limit.toString(),
      offset: offset.toString(),
      sort: "joinedAt:desc",
    });

    if (roleId) {
      params.append("roleId", roleId);
    }

    const url = `https://api.vrchat.cloud/api/1/groups/${groupId}/members?${params.toString()}`;
    
    console.log(`  Fetching members ${offset + 1}-${offset + limit}...`);
    
    const response = await axios.get(url, {
      headers: {
        Cookie: cookie,
        "User-Agent": USER_AGENT,
      },
    });

    const members = response.data;
    
    if (!members || members.length === 0) {
      break;
    }

    allMembers.push(...members);
    
    if (members.length < limit) {
      break; // Last page
    }

    offset += limit;
  }

  return allMembers;
}

// ===== Main Script =====
async function main() {
  const groupId = "grp_43cd4abe-0c59-4e07-8b28-38130c096ebe";
  
  if (!groupId) {
    console.error("❌ Error: VRCHAT_GROUP_ID environment variable is not set!");
    console.error("Please add it to your .env file: VRCHAT_GROUP_ID=grp_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
    process.exit(1);
  }

  const vrcUsername = process.env.VRCHAT_USERNAME;
  const vrcPassword = process.env.VRCHAT_PASSWORD;

  if (!vrcUsername || !vrcPassword) {
    console.error("❌ Error: VRCHAT_USERNAME and VRCHAT_PASSWORD must be set in .env");
    process.exit(1);
  }

  try {
    console.log("\n🔐 Authenticating with VRChat...");
    const user = await loginToVRChat(vrcUsername, vrcPassword);
    console.log(`✓ Logged in as: ${user.displayName} (${user.username})\n`);

    console.log("📋 Fetching group roles...");
    const roles = await getGroupRoles(groupId);
    console.log(`✓ Found ${roles.length} roles\n`);

    // Create a map for quick role lookup
    const roleMap = new Map<string, GroupRole>();
    roles.forEach(role => roleMap.set(role.id, role));

    console.log("👥 Fetching group members...");
    const members = await getGroupMembers(groupId);
    console.log(`✓ Found ${members.length} members\n`);

    // Create a map to group members by their roles
    const membersByRole = new Map<string, GroupMember[]>();
    
    // Initialize with empty arrays for each role
    roles.forEach(role => membersByRole.set(role.id, []));
    
    // Add a special category for members with no roles
    membersByRole.set("__NO_ROLE__", []);

    // Categorize members by their primary role (first roleId)
    members.forEach(member => {
      if (member.roleIds && member.roleIds.length > 0) {
        const primaryRoleId = member.roleIds[0];
        if (!membersByRole.has(primaryRoleId)) {
          membersByRole.set(primaryRoleId, []);
        }
        membersByRole.get(primaryRoleId)!.push(member);
      } else {
        membersByRole.get("__NO_ROLE__")!.push(member);
      }
    });

    // Sort roles by order (ascending)
    const sortedRoles = [...roles].sort((a, b) => a.order - b.order);

    // Print output
    console.log("=".repeat(80));
    console.log(`GROUP MEMBERS SORTED BY ROLE (${members.length} total)`);
    console.log("=".repeat(80));
    console.log();

    for (const role of sortedRoles) {
      const roleMembers = membersByRole.get(role.id) || [];
      
      if (roleMembers.length > 0) {
        console.log(`\n┌─ ${role.name.toUpperCase()} (${roleMembers.length} members)`);
        console.log(`│  Order: ${role.order} | Role ID: ${role.id}`);
        if (role.description) {
          console.log(`│  Description: ${role.description}`);
        }
        console.log("└─");
        
        roleMembers.forEach((member, idx) => {
          const allRoleNames = member.roleIds
            .map(rid => roleMap.get(rid)?.name || rid)
            .join(", ");
          
          console.log(
            `   ${(idx + 1).toString().padStart(3)}. ${member.user.displayName.padEnd(30)} | ${member.userId}`
          );
          
          if (member.roleIds.length > 1) {
            console.log(`        Additional roles: ${allRoleNames}`);
          }
        });
      }
    }

    // Print members with no roles
    const noRoleMembers = membersByRole.get("__NO_ROLE__") || [];
    if (noRoleMembers.length > 0) {
      console.log(`\n┌─ NO ROLE (${noRoleMembers.length} members)`);
      console.log("└─");
      noRoleMembers.forEach((member, idx) => {
        console.log(
          `   ${(idx + 1).toString().padStart(3)}. ${member.user.displayName.padEnd(30)} | ${member.userId}`
        );
      });
    }

    console.log("\n" + "=".repeat(80));
    console.log("✓ Done!");
    console.log("=".repeat(80) + "\n");

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run the script
main();
