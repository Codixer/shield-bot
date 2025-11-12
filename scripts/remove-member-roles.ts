#!/usr/bin/env ts-node-esm
/**
 * Script to remove all non-management roles from VRChat group members
 * 
 * IMPORTANT VRChat Permission Rules:
 * - You CANNOT modify ANY role (management or member) for users who have a role 
 *   at or above your own highest role in the hierarchyy
 * - This script will ONLY modify members whose highest role is below your bot's highest role
 * - Members with roles at/above your level will be SKIPPED
 * 
 * Run with: ts-node-esm scripts/remove-member-roles.ts
 * 
 * WARNING: This will remove roles from members below your permission level! Use with caution!
 */

import "dotenv/config";
import axios from "axios";
import { authenticator } from "otplib";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

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
  isManagementRole: boolean;
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

async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
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

async function getGroup(groupId: string): Promise<any> {
  const cookie = loadCookie();
  if (!cookie) throw new Error("Not authenticated");

  const url = `https://api.vrchat.cloud/api/1/groups/${groupId}`;
  const response = await axios.get(url, {
    headers: {
      Cookie: cookie,
      "User-Agent": USER_AGENT,
    },
  });

  return response.data;
}

async function removeRoleFromMember(
  groupId: string,
  userId: string,
  roleId: string
): Promise<void> {
  const cookie = loadCookie();
  if (!cookie) throw new Error("Not authenticated");

  const url = `https://api.vrchat.cloud/api/1/groups/${groupId}/members/${userId}/roles/${roleId}`;
  
  await axios.delete(url, {
    headers: {
      Cookie: cookie,
      "User-Agent": USER_AGENT,
    },
  });
}

// ===== Utility Functions =====
async function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

    console.log("📋 Fetching group info...");
    const group = await getGroup(groupId);
    console.log(`✓ Group: ${group.name}\n`);

    console.log("📋 Fetching group roles...");
    const roles = await getGroupRoles(groupId);
    console.log(`✓ Found ${roles.length} roles\n`);

    // Get bot's membership info from the group data
    const botMember = group.myMember;
    if (!botMember) {
      console.error("❌ Error: Bot is not a member of this group!");
      process.exit(1);
    }

    console.log("🤖 Bot's Group Membership:");
    console.log(`   User ID: ${botMember.userId}`);
    console.log(`   Role IDs: ${botMember.roleIds.join(", ")}`);

    // Create a map for quick role lookup
    const roleMap = new Map<string, GroupRole>();
    roles.forEach(role => roleMap.set(role.id, role));

    // Find bot's highest role (lowest order number = highest rank)
    let botHighestRole: GroupRole | null = null;
    let botHighestRoleOrder = Infinity;

    for (const roleId of botMember.roleIds) {
      const role = roleMap.get(roleId);
      if (role && role.order < botHighestRoleOrder) {
        botHighestRole = role;
        botHighestRoleOrder = role.order;
      }
    }

    if (!botHighestRole) {
      console.error("❌ Error: Bot has no roles in this group!");
      process.exit(1);
    }

    console.log(`   Highest Role: ${botHighestRole.name} (order: ${botHighestRole.order})`);
    console.log(`   Is Management: ${botHighestRole.isManagementRole}\n`);

    // Separate roles based on bot's permission level
    // Bot can only modify roles BELOW its highest role (higher order number)
    const rolesAboveBot = roles.filter(r => r.order <= botHighestRoleOrder);
    const rolesBelowBot = roles.filter(r => r.order > botHighestRoleOrder);
    const memberRolesBelowBot = rolesBelowBot.filter(r => !r.isManagementRole);

    console.log("📊 Role Hierarchy Analysis:");
    console.log(`   Roles at/above bot's level (CANNOT MODIFY): ${rolesAboveBot.length}`);
    rolesAboveBot.forEach(role => {
      const marker = role.id === botHighestRole.id ? " ← BOT'S HIGHEST ROLE" : "";
      const mgmt = role.isManagementRole ? " [Management]" : "";
      console.log(`      - ${role.name} (order: ${role.order})${mgmt}${marker}`);
    });
    console.log(`\n   Roles below bot's level (CAN MODIFY): ${rolesBelowBot.length}`);
    rolesBelowBot.forEach(role => {
      const mgmt = role.isManagementRole ? " [Management - PRESERVE]" : " [Member - REMOVE]";
      console.log(`      - ${role.name} (order: ${role.order})${mgmt}`);
    });
    console.log(`\n   Member roles that will be REMOVED: ${memberRolesBelowBot.length}`);
    memberRolesBelowBot.forEach(role => {
      console.log(`      - ${role.name} (order: ${role.order})`);
    });
    console.log();

    console.log("👥 Fetching group members...");
    const members = await getGroupMembers(groupId);
    console.log(`✓ Found ${members.length} members\n`);

    // Calculate what will be removed
    const memberRoleIds = new Set(memberRolesBelowBot.map(r => r.id));
    let totalRolesToRemove = 0;
    let membersAffected = 0;
    let membersSkipped = 0;
    
    const removalPlan: Array<{ member: GroupMember; rolesToRemove: string[]; highestRole: GroupRole }> = [];
    const skippedMembers: Array<{ member: GroupMember; reason: string; highestRole: GroupRole }> = [];

    members.forEach(member => {
      // Skip the bot itself
      if (member.userId === botMember.userId) {
        return;
      }

      // Find member's highest role
      let memberHighestRole: GroupRole | null = null;
      let memberHighestRoleOrder = Infinity;

      for (const roleId of member.roleIds) {
        const role = roleMap.get(roleId);
        if (role && role.order < memberHighestRoleOrder) {
          memberHighestRole = role;
          memberHighestRoleOrder = role.order;
        }
      }

      // If member has no roles, they can be modified
      if (!memberHighestRole) {
        memberHighestRole = { id: "none", name: "No Role", order: Infinity, isManagementRole: false } as GroupRole;
      }

      // Check if we can modify this member
      // We can only modify if their highest role is BELOW ours (higher order number)
      if (memberHighestRoleOrder <= botHighestRoleOrder) {
        membersSkipped++;
        skippedMembers.push({
          member,
          reason: "Member's highest role is at or above bot's level",
          highestRole: memberHighestRole,
        });
        return;
      }

      // Find roles to remove (only non-management roles below bot's level)
      const rolesToRemove = member.roleIds.filter(roleId => memberRoleIds.has(roleId));
      
      if (rolesToRemove.length > 0) {
        membersAffected++;
        totalRolesToRemove += rolesToRemove.length;
        removalPlan.push({ member, rolesToRemove, highestRole: memberHighestRole });
      }
    });

    console.log("=".repeat(80));
    console.log("⚠️  REMOVAL SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total members in group: ${members.length - 1} (excluding bot)`);
    console.log(`Members that CAN be modified (below bot's level): ${membersAffected + (removalPlan.length === 0 ? members.length - 1 - membersSkipped : 0)}`);
    console.log(`Members that will be affected: ${membersAffected}`);
    console.log(`Members that will be SKIPPED (at/above bot's level): ${membersSkipped}`);
    console.log(`Total role assignments to be removed: ${totalRolesToRemove}`);
    console.log();
    
    if (memberRolesBelowBot.length > 0) {
      console.log("The following roles will be REMOVED from members:");
      memberRolesBelowBot.forEach(role => {
        const count = removalPlan.reduce((sum, plan) => 
          sum + (plan.rolesToRemove.includes(role.id) ? 1 : 0), 0
        );
        console.log(`   - ${role.name} (order: ${role.order}): ${count} assignments`);
      });
      console.log();
    }

    console.log("The following roles will be PRESERVED:");
    console.log("  Management roles below bot's level:");
    rolesBelowBot.filter(r => r.isManagementRole).forEach(role => {
      console.log(`   - ${role.name} (order: ${role.order})`);
    });
    console.log("  ALL roles at/above bot's level:");
    rolesAboveBot.forEach(role => {
      console.log(`   - ${role.name} (order: ${role.order})`);
    });
    console.log("=".repeat(80));
    console.log();

    // Show a preview of first 5 affected members
    if (removalPlan.length > 0) {
      console.log("Preview of affected members (first 5):");
      removalPlan.slice(0, 5).forEach((plan, idx) => {
        const roleNames = plan.rolesToRemove
          .map(rid => roleMap.get(rid)?.name || rid)
          .join(", ");
        console.log(`   ${idx + 1}. ${plan.member.user.displayName} (highest: ${plan.highestRole.name})`);
        console.log(`      Removing: ${roleNames}`);
      });
      if (removalPlan.length > 5) {
        console.log(`   ... and ${removalPlan.length - 5} more members`);
      }
      console.log();
    }

    // Show preview of skipped members
    if (skippedMembers.length > 0) {
      console.log("Preview of SKIPPED members (first 5):");
      skippedMembers.slice(0, 5).forEach((skip, idx) => {
        console.log(`   ${idx + 1}. ${skip.member.user.displayName} (highest: ${skip.highestRole.name}, order: ${skip.highestRole.order})`);
        console.log(`      Reason: ${skip.reason}`);
      });
      if (skippedMembers.length > 5) {
        console.log(`   ... and ${skippedMembers.length - 5} more skipped members`);
      }
      console.log();
    }

    // Final confirmation
    console.log("⚠️  WARNING: This action cannot be undone!");
    console.log("⚠️  All non-management roles BELOW your permission level will be removed!");
    console.log(`⚠️  Members with roles at/above '${botHighestRole.name}' will NOT be modified!`);
    console.log();
    
    const confirmed = await askConfirmation("Type 'yes' to proceed with role removal: ");
    
    if (!confirmed) {
      console.log("\n❌ Operation cancelled by user.");
      process.exit(0);
    }

    console.log("\n🗑️  Starting role removal...\n");

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < removalPlan.length; i++) {
      const { member, rolesToRemove } = removalPlan[i];
      
      console.log(`[${i + 1}/${removalPlan.length}] Processing ${member.user.displayName}...`);
      
      for (const roleId of rolesToRemove) {
        const roleName = roleMap.get(roleId)?.name || roleId;
        try {
          await removeRoleFromMember(groupId, member.userId, roleId);
          console.log(`   ✓ Removed role: ${roleName}`);
          successCount++;
          
          // Small delay to avoid rate limiting (100ms between each role removal)
          await sleep(100);
        } catch (error: any) {
          console.log(`   ✗ Failed to remove role: ${roleName}`);
          if (error.response) {
            console.log(`     Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
          } else {
            console.log(`     Error: ${error.message}`);
          }
          errorCount++;
        }
      }
      
      // Longer delay between members (500ms)
      if (i < removalPlan.length - 1) {
        await sleep(500);
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("✓ OPERATION COMPLETE");
    console.log("=".repeat(80));
    console.log(`Successfully removed: ${successCount} role assignments`);
    console.log(`Failed: ${errorCount} role assignments`);
    console.log(`Members processed: ${removalPlan.length}`);
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
