// User-related VRChat API methods

import axios from "axios";
import { authenticator } from "otplib";
import { loadCookie, saveCookie, USER_AGENT } from "../vrchat/index.js";
import { prisma } from "../../main.js";
// Use the application's Prisma instance from main.ts at runtime to avoid creating a separate client here.

export async function sendFriendRequest(userId: string): Promise<object> {
  const cookie = loadCookie();
  if (!cookie) throw new Error("Not authenticated. Please log in first.");
  const url = `https://api.vrchat.cloud/api/1/user/${userId}/friendRequest`;
  const headers = {
    Cookie: cookie,
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
  };
  let res = await fetch(url, {
    method: "POST",
    headers,
  });
  if (res.status === 400) {
    // Already friends, unfriend and try again
    await unfriendUser(userId);
    res = await fetch(url, {
      method: "POST",
      headers,
    });
  }
  if (!res.ok) {
    throw new Error(
      `Failed to send friend request: ${res.status} ${await res.text()}`,
    );
  }
  return await res.json();
}

export async function unfriendUser(userId: string): Promise<object> {
  const cookie = loadCookie();
  if (!cookie) throw new Error("Not authenticated. Please log in first.");
  const url = `https://api.vrchat.cloud/api/1/auth/user/friends/${userId}`;
  const headers = {
    Cookie: cookie,
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
  };
  const res = await fetch(url, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    throw new Error(
      `Failed to unfriend user: ${res.status} ${await res.text()}`,
    );
  }
  return await res.json();
}

export async function loginAndGetCurrentUser(
  username: string,
  password: string,
) {
  let cookie = loadCookie();
  let headers: any = { "User-Agent": USER_AGENT };
  if (cookie) headers["Cookie"] = cookie;

  // Try with cookie first
  try {
    const response = await axios.get(
      "https://api.vrchat.cloud/api/1/auth/user",
      { headers },
    );
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
  const credentials = Buffer.from(
    `${encode(username)}:${encode(password)}`,
  ).toString("base64");
  headers["Authorization"] = `Basic ${credentials}`;
  let response = await axios.get("https://api.vrchat.cloud/api/1/auth/user", {
    headers,
  });

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
  if (
    methods.includes("emailOtp") &&
    !methods.includes("otp") &&
    !methods.includes("totp")
  ) {
    throw new Error(
      "Login refused: Only emailOtp is supported for this account, shutting down.",
    );
  }
  if (!(methods.includes("otp") || methods.includes("totp"))) {
    throw new Error(
      "2FA required but no supported method (otp/totp) available",
    );
  }
  const otpToken = process.env.VRCHAT_OTP_TOKEN;
  if (!otpToken) throw new Error("VRCHAT_OTP_TOKEN env variable not set");
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
    },
  );
  const verifySetCookie = verifyRes.headers["set-cookie"];
  let finalCookies = allCookiesArr;
  if (verifySetCookie && verifySetCookie.length > 0) {
    const twoFactorCookie = verifySetCookie.find((c: string) =>
      c.startsWith("twoFactorAuth="),
    );
    if (twoFactorCookie) finalCookies.push(twoFactorCookie.split(";")[0]);
  }
  saveCookie(finalCookies.join("; "));
  if (!verifyRes.data.verified) {
    throw new Error("2FA verification failed");
  }
  return verifyRes.data;
}

export async function isLoggedInAndVerified() {
  const cookie = loadCookie();
  if (!cookie) return false;
  try {
    const headers = { "User-Agent": USER_AGENT, Cookie: cookie };
    const response = await axios.get(
      "https://api.vrchat.cloud/api/1/auth/user",
      { headers },
    );
    const user = response.data;
    if (!user || !user.id) return false;
    if (user.has2FA && user.has2FAEmail && user.emailVerified) return true;
    if (!user.has2FA && user.id) return true;
    return false;
  } catch {
    return false;
  }
}

export async function searchUsers({
  search,
  n = 60,
  offset = 0,
  developerType,
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
    Cookie: cookie,
  };
  const params = new URLSearchParams({
    search,
    n: n.toString(),
    offset: offset.toString(),
  });
  const url = `https://api.vrchat.cloud/api/1/users?${params.toString()}`;
  const response = await axios.get(url, { headers });
  return response.data;
}

export async function acceptFriendRequest(notificationId: string) {
  const cookie = loadCookie();
  if (!cookie) throw new Error("Not authenticated. Please log in first.");

  const url = `https://api.vrchat.cloud/api/1/auth/user/notifications/${notificationId}/accept`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      Cookie: cookie,
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to accept friend request: ${response.status} ${response.statusText}`,
    );
  }
  return await response.json();
}

export async function getUserById(userId: string) {
  if (!userId) throw new Error("User ID is required");
  const cookie = loadCookie();
  if (!cookie) throw new Error("Not authenticated. Please log in first.");
  const headers = {
    "User-Agent": USER_AGENT,
    Cookie: cookie,
    "Content-Type": "application/json",
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

export async function getCurrentUser() {
  const cookie = loadCookie();
  if (!cookie) return null;
  const headers = { "User-Agent": USER_AGENT, Cookie: cookie };
  try {
    const response = await axios.get(
      "https://api.vrchat.cloud/api/1/auth/user",
      { headers },
    );
    return response.data;
  } catch (e: any) {
    if (e.response && e.response.status === 401) return null;
    throw e;
  }
}

/**
 * Get VRChat account status for a Discord user
 */
export async function getVRChatAccountStatus(discordId: string) {
  const user = await prisma.user.findUnique({
    where: { discordId },
    include: { vrchatAccounts: true },
  });

  const boundAccounts = user?.vrchatAccounts || [];
  const verifiedAccounts = boundAccounts.filter(
    (acc: any) => acc.accountType === "MAIN" || acc.accountType === "ALT",
  );

  return {
    hasBoundAccount: boundAccounts.length > 0,
    hasVerifiedAccount: verifiedAccounts.length > 0,
    boundAccounts,
    verifiedAccounts,
  };
}
