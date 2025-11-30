import { describe, it, expect, beforeEach, vi } from "vitest";
import { validateEnv, hasVRChatCredentials } from "./env.js";

describe("Environment Validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset process.env
    process.env = { ...originalEnv };
    // Clear the cached env
    vi.resetModules();
  });

  it("should validate required environment variables", () => {
    process.env.BOT_TOKEN = "test-token";
    process.env.BOT_OWNER_ID = "123456789";
    process.env.DATABASE_URL = "mysql://user:pass@localhost:3306/db";

    expect(() => validateEnv()).not.toThrow();
  });

  it("should throw error for missing required variables", () => {
    delete process.env.BOT_TOKEN;
    process.env.BOT_OWNER_ID = "123456789";
    process.env.DATABASE_URL = "mysql://user:pass@localhost:3306/db";

    expect(() => validateEnv()).toThrow();
  });

  it("should validate DATABASE_URL format", () => {
    process.env.BOT_TOKEN = "test-token";
    process.env.BOT_OWNER_ID = "123456789";
    process.env.DATABASE_URL = "invalid-url";

    expect(() => validateEnv()).toThrow();
  });

  it("should default PORT to 3000", () => {
    process.env.BOT_TOKEN = "test-token";
    process.env.BOT_OWNER_ID = "123456789";
    process.env.DATABASE_URL = "mysql://user:pass@localhost:3306/db";
    delete process.env.PORT;

    const env = validateEnv();
    expect(env.PORT).toBe(3000);
  });

  it("should check VRChat credentials", () => {
    process.env.BOT_TOKEN = "test-token";
    process.env.BOT_OWNER_ID = "123456789";
    process.env.DATABASE_URL = "mysql://user:pass@localhost:3306/db";
    process.env.VRCHAT_USERNAME = "testuser";
    process.env.VRCHAT_PASSWORD = "testpass";

    validateEnv();
    expect(hasVRChatCredentials()).toBe(true);
  });

  it("should return false when VRChat credentials are missing", () => {
    process.env.BOT_TOKEN = "test-token";
    process.env.BOT_OWNER_ID = "123456789";
    process.env.DATABASE_URL = "mysql://user:pass@localhost:3306/db";
    delete process.env.VRCHAT_USERNAME;
    delete process.env.VRCHAT_PASSWORD;

    validateEnv();
    expect(hasVRChatCredentials()).toBe(false);
  });
});

