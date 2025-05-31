import vrchat from "vrchat";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { authenticator } from "otplib";

const USER_AGENT = process.env.VRCHAT_USER_AGENT || "CodixerBot/0.0.1 contact@stefanocoding.me";
const options = { headers: { "User-Agent": USER_AGENT }};

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
    let response;
    try {
        response = await axios.get("https://api.vrchat.cloud/api/1/auth/user", { headers });
        // If successful, update cookie (in case it changed)
        const setCookie = response.headers["set-cookie"];
        if (setCookie && setCookie.length > 0) saveCookie(setCookie.join("; "));
        return response.data;
    } catch (err: any) {
        // If unauthorized, try login with credentials
        if (err.response && err.response.status === 401) {
            const encode = (str: string) => encodeURIComponent(str);
            const credentials = Buffer.from(`${encode(username)}:${encode(password)}`).toString("base64");
            headers["Authorization"] = `Basic ${credentials}`;
            response = await axios.get("https://api.vrchat.cloud/api/1/auth/user", { headers });
            // Check for 2FA requirement
            if (response.data.requiresTwoFactorAuth) {
                const methods = response.data.requiresTwoFactorAuth;
                if (methods.includes("emailOtp") && !methods.includes("otp") && !methods.includes("totp")) {
                    throw new Error("Login refused: Only emailOtp is supported for this account, shutting down.");
                }
                if (methods.includes("otp") || methods.includes("totp")) {
                    // Generate TOTP code
                    const otpToken = process.env.VRCHAT_OTP_TOKEN;
                    if (!otpToken) throw new Error("VRCHAT_OTP_TOKEN env variable not set");
                    const code = authenticator.generate(otpToken);
                    // Get all cookies from set-cookie header
                    let allCookiesArr: string[] = [];
                    const setCookie = response.headers["set-cookie"];
                    if (setCookie && setCookie.length > 0) {
                        allCookiesArr = setCookie.map((c: string) => c.split(';')[0]);
                    }
                    // Always keep the auth cookie for session reuse
                    let authCookie = allCookiesArr.find((c: string) => c.startsWith("auth="));
                    if (!authCookie) throw new Error("No auth cookie found for 2FA verification");
                    // Use only the auth cookie for 2FA verification (per VRChat API docs)
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
                    // Save both cookies for future use
                    const verifySetCookie = verifyRes.headers["set-cookie"];
                    let finalCookies = allCookiesArr;
                    if (verifySetCookie && verifySetCookie.length > 0) {
                        const twoFactorCookie = verifySetCookie.find((c: string) => c.startsWith("twoFactorAuth="));
                        if (twoFactorCookie) finalCookies.push(twoFactorCookie.split(";")[0]);
                    }
                    // Always save the auth cookie (and twoFactorAuth if present)
                    saveCookie(finalCookies.join("; "));
                    if (verifyRes.data.verified) {
                        return verifyRes.data;
                    } else {
                        throw new Error("2FA verification failed");
                    }
                }
            }
            // Save new cookie (auth only) for future reuse
            const setCookie = response.headers["set-cookie"];
            if (setCookie && setCookie.length > 0) {
                // Only keep the auth cookie for session reuse
                const authCookie = setCookie.find((c: string) => c.startsWith("auth="));
                if (authCookie) saveCookie(authCookie.split(";")[0]);
                else saveCookie(setCookie.join("; "));
            }
            return response.data;
        } else {
            throw err;
        }
    }
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
