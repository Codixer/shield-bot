import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { validateEnv, getEnv } from "../src/config/env.js";
import { encrypt, isEncrypted } from "../src/utility/encryption.js";
import { loggers } from "../src/utility/logger.js";

/**
 * Migration script to encrypt existing plaintext credentials in the database
 * 
 * This script:
 * 1. Reads all guild settings
 * 2. Checks if whitelistGitHubToken and whitelistXorKey are encrypted
 * 3. If not encrypted, encrypts them using ENCRYPTION_KEY
 * 4. Updates the database with encrypted values
 * 
 * Usage:
 *   npx ts-node-esm scripts/encrypt-credentials.ts
 * 
 * Requirements:
 *   - ENCRYPTION_KEY environment variable must be set (at least 32 characters)
 *   - DATABASE_URL environment variable must be set
 */
async function main() {
  try {
    // Validate environment variables
    validateEnv();
    const env = getEnv();
    
    if (!env.ENCRYPTION_KEY) {
      console.error("❌ ENCRYPTION_KEY environment variable is required");
      console.error("   Please set ENCRYPTION_KEY to a secure random string (at least 32 characters)");
      process.exit(1);
    }

    if (env.ENCRYPTION_KEY.length < 32) {
      console.error("❌ ENCRYPTION_KEY must be at least 32 characters long");
      process.exit(1);
    }

    console.log("🔐 Starting credential encryption migration...");
    console.log(`   Encryption key length: ${env.ENCRYPTION_KEY.length} characters`);

    // Initialize Prisma client
    const databaseUrl = env.DATABASE_URL;
    const adapter = new PrismaMariaDb(databaseUrl);
    const prisma = new PrismaClient({ adapter });

    // Get all guild settings
    const allSettings = await prisma.guildSettings.findMany({
      select: {
        id: true,
        guildId: true,
        whitelistGitHubToken: true,
        whitelistXorKey: true,
      },
    });

    console.log(`\n📊 Found ${allSettings.length} guild settings to check`);

    let encryptedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const settings of allSettings) {
      try {
        let needsUpdate = false;
        const updateData: {
          whitelistGitHubToken?: string;
          whitelistXorKey?: string;
        } = {};

        // Check and encrypt GitHub token
        if (settings.whitelistGitHubToken && !isEncrypted(settings.whitelistGitHubToken)) {
          console.log(`   🔒 Encrypting GitHub token for guild ${settings.guildId}...`);
          updateData.whitelistGitHubToken = await encrypt(
            settings.whitelistGitHubToken,
            env.ENCRYPTION_KEY,
          );
          needsUpdate = true;
        }

        // Check and encrypt XOR key
        if (settings.whitelistXorKey && !isEncrypted(settings.whitelistXorKey)) {
          console.log(`   🔒 Encrypting XOR key for guild ${settings.guildId}...`);
          updateData.whitelistXorKey = await encrypt(
            settings.whitelistXorKey,
            env.ENCRYPTION_KEY,
          );
          needsUpdate = true;
        }

        // Update database if needed
        if (needsUpdate) {
          await prisma.guildSettings.update({
            where: { id: settings.id },
            data: updateData,
          });
          encryptedCount++;
          console.log(`   ✅ Encrypted credentials for guild ${settings.guildId}`);
        } else {
          skippedCount++;
          console.log(`   ⏭️  Guild ${settings.guildId} already encrypted or has no credentials`);
        }
      } catch (error) {
        errorCount++;
        loggers.bot.error(`Failed to encrypt credentials for guild ${settings.guildId}`, error);
        console.error(`   ❌ Error processing guild ${settings.guildId}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    console.log("\n📈 Migration Summary:");
    console.log(`   ✅ Encrypted: ${encryptedCount} guild(s)`);
    console.log(`   ⏭️  Skipped: ${skippedCount} guild(s)`);
    console.log(`   ❌ Errors: ${errorCount} guild(s)`);

    if (errorCount > 0) {
      console.log("\n⚠️  Some credentials could not be encrypted. Please review the errors above.");
      process.exit(1);
    } else {
      console.log("\n✨ Migration completed successfully!");
    }

    await prisma.$disconnect();
  } catch (error) {
    loggers.bot.error("Migration failed", error);
    console.error("❌ Migration failed:", error instanceof Error ? error.message : "Unknown error");
    process.exit(1);
  }
}

main();
