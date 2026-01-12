import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { validateEnv, getEnv } from "../src/config/env.js";
import { loggers } from "../src/utility/logger.js";

/**
 * Migration helper script to guide users through migrating from PAT to GitHub App
 * 
 * This script:
 * 1. Checks for existing PAT configuration
 * 2. Warns about deprecated PAT support
 * 3. Provides instructions for creating a GitHub App
 * 4. Shows migration checklist
 * 
 * Usage:
 *   npx ts-node-esm scripts/migrate-to-github-app.ts
 * 
 * Requirements:
 *   - DATABASE_URL environment variable must be set
 */
async function main() {
  try {
    console.log("🔐 GitHub App Migration Helper\n");
    console.log("This script will help you migrate from Personal Access Token (PAT)");
    console.log("to GitHub App authentication.\n");

    // Validate environment variables
    try {
      validateEnv();
    } catch (error) {
      console.error("⚠️  Environment validation failed. Continuing anyway...");
    }

    // Initialize Prisma client
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.error("❌ DATABASE_URL environment variable is required");
      process.exit(1);
    }

    const adapter = new PrismaMariaDb(databaseUrl);
    const prisma = new PrismaClient({ adapter });

    // Check for existing PAT configuration
    const allSettings = await prisma.guildSettings.findMany({
      select: {
        id: true,
        guildId: true,
        whitelistGitHubToken: true,
        whitelistGitHubAppId: true,
        whitelistGitHubAppPrivateKey: true,
        whitelistGitHubInstallationId: true,
      },
    });

    console.log(`📊 Checking ${allSettings.length} guild configuration(s)...\n`);

    let patCount = 0;
    let appCount = 0;
    let neitherCount = 0;

    for (const settings of allSettings) {
      const hasPAT = !!settings.whitelistGitHubToken;
      const hasApp = !!(
        settings.whitelistGitHubAppId &&
        settings.whitelistGitHubAppPrivateKey &&
        settings.whitelistGitHubInstallationId
      );

      if (hasPAT && !hasApp) {
        patCount++;
        console.log(`⚠️  Guild ${settings.guildId}: Using PAT (needs migration)`);
      } else if (hasApp) {
        appCount++;
        console.log(`✅ Guild ${settings.guildId}: Using GitHub App`);
      } else {
        neitherCount++;
        console.log(`ℹ️  Guild ${settings.guildId}: No GitHub configuration`);
      }
    }

    console.log("\n📈 Summary:");
    console.log(`   ✅ Using GitHub App: ${appCount} guild(s)`);
    console.log(`   ⚠️  Using PAT (deprecated): ${patCount} guild(s)`);
    console.log(`   ℹ️  No configuration: ${neitherCount} guild(s)`);

    if (patCount > 0) {
      console.log("\n⚠️  WARNING: Personal Access Token (PAT) support is deprecated!");
      console.log("   PAT authentication will be removed in a future version.");
      console.log("   Please migrate to GitHub App authentication as soon as possible.\n");
    }

    if (patCount > 0 || neitherCount > 0) {
      console.log("📋 Migration Checklist:\n");
      console.log("1. Create a GitHub App:");
      console.log("   - Go to: https://github.com/organizations/<your-org>/settings/apps/new");
      console.log("   - Or user settings: https://github.com/settings/apps/new");
      console.log("   - Give it a name (e.g., 'S.H.I.E.L.D. Bot Whitelist')");
      console.log("   - Set homepage URL (optional)");
      console.log("   - Set webhook URL (optional, leave empty if not needed)");
      console.log("   - Set permissions:");
      console.log("     • Repository permissions:");
      console.log("       - Contents: Read and write");
      console.log("     • Account permissions: (none needed)");
      console.log("   - Where can this GitHub App be installed:");
      console.log("     • Select: 'Only on this account' or 'Any account'");
      console.log("\n");

      console.log("2. Generate and save the private key:");
      console.log("   - After creating the app, click 'Generate a private key'");
      console.log("   - Download and save the .pem file securely");
      console.log("   - ⚠️  You can only download this once!");
      console.log("   - Store it in a secure location (password manager, secrets manager)");
      console.log("\n");

      console.log("3. Install the GitHub App:");
      console.log("   - Go to: https://github.com/settings/installations");
      console.log("   - Or: https://github.com/organizations/<your-org>/settings/installations");
      console.log("   - Click 'Configure' next to your app");
      console.log("   - Select the repositories (or 'All repositories')");
      console.log("   - Click 'Install'");
      console.log("\n");

      console.log("4. Get the App ID and Installation ID:");
      console.log("   - App ID: Found on your app's settings page");
      console.log("     https://github.com/settings/apps/<your-app-name>");
      console.log("   - Installation ID: Found in the URL after installation");
      console.log("     https://github.com/settings/installations/<installation-id>");
      console.log("   - Or use the API: GET /app/installations");
      console.log("\n");

      console.log("5. Configure via Discord commands:");
      console.log("   /settings whitelist gh-app-id app_id:<app-id>");
      console.log("   /settings whitelist gh-app-key private_key:<paste-full-pem-key>");
      console.log("   /settings whitelist gh-installation-id installation_id:<installation-id>");
      console.log("\n");

      console.log("   Or via environment variables:");
      console.log("   GITHUB_APP_ID=<app-id>");
      console.log("   GITHUB_APP_PRIVATE_KEY=<full-pem-key-including-headers>");
      console.log("   GITHUB_APP_INSTALLATION_ID=<installation-id>");
      console.log("\n");

      console.log("6. Verify the configuration:");
      console.log("   /settings whitelist view");
      console.log("   - Check that App ID, Installation ID are set");
      console.log("   - Check that Private Key shows a masked value");
      console.log("\n");

      console.log("7. Test the integration:");
      console.log("   - Make a whitelist change");
      console.log("   - Verify it updates the GitHub repository");
      console.log("\n");

      console.log("8. Remove old PAT (after verifying App works):");
      console.log("   - Old PAT tokens stored in database can be left (will be ignored)");
      console.log("   - Remove GITHUB_TOKEN from environment variables");
      console.log("\n");

      if (patCount > 0) {
        console.log("⚠️  Important Notes:");
        console.log("   - After migration, old PAT tokens will be ignored");
        console.log("   - All GitHub operations will use the GitHub App");
        console.log("   - Installation tokens are automatically refreshed");
        console.log("   - Private keys are encrypted in the database (if ENCRYPTION_KEY is set)");
        console.log("\n");
      }
    } else {
      console.log("\n✅ All guilds are already using GitHub App authentication!");
      console.log("   No migration needed.\n");
    }

    await prisma.$disconnect();
  } catch (error) {
    loggers.bot.error("Migration helper failed", error);
    console.error("❌ Migration helper failed:", error instanceof Error ? error.message : "Unknown error");
    process.exit(1);
  }
}

main();
