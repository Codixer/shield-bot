import "dotenv/config";
import { dirname, importx } from "@discordx/importer";
import { Koa } from "@discordx/koa";
import multer from "@koa/multer";
import {
  ActivityType,
  IntentsBitField,
  Interaction,
  Message,
} from "discord.js";
import { Client } from "discordx";
import bodyParser from "@koa/bodyparser";
import { PrismaClient } from "./generated/prisma/client.js";
import { PatrolTimerManager } from "./managers/patrol/patrolTimerManager.js";
import {
  isLoggedInAndVerified,
  loginAndGetCurrentUser,
} from "./utility/vrchat.js";
import { startVRChatWebSocketListener, stopVRChatWebSocketListener } from "./events/vrchat/vrchat-websocket.js";
// Invite message functionality removed - not in use
// import {
//   syncAllInviteMessages,
//   syncInviteMessageIfDifferent,
// } from "./managers/messages/InviteMessageManager.js";
import { initializeSchedules } from "./schedules/schedules.js";
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { whitelistManager } from "./managers/whitelist/whitelistManager.js";

const databaseUrl = process.env.DATABASE_URL!;

const adapter = new PrismaMariaDb(databaseUrl);

export const prisma = new PrismaClient({ adapter });

export const bot = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildVoiceStates,
  ],
  silent: false,
});

// Global patrol timer manager singleton
export const patrolTimer = new PatrolTimerManager(bot);

bot.rest.on("rateLimited", (info) => {
  console.log("Rate limit hit!");
  console.log(`Endpoint: ${info.route}`);
  console.log(`Timeout: ${info.timeToReset}ms`);
  console.log(`Limit: ${info.limit}`);
});

bot.once("clientReady", async () => {
  try {
    await bot.initApplicationCommands();
    console.log("###################################################");
    console.log("|                      |                          |");
    console.log("|                      |     S.H.I.E.L.D. Bot     |");
    console.log("|                      |                          |");
    console.log("|                      |                          |");
    console.log("|                      | stefano@stefanocoding.me |");
    console.log("|                      |         Codixer          |");
    console.log("|                      |                          |");
    console.log("###################################################");

    // VRChat login on startup
    const vrcUsername = process.env.VRCHAT_USERNAME;
    const vrcPassword = process.env.VRCHAT_PASSWORD;
    if (!vrcUsername || !vrcPassword) {
      console.warn(
        "[VRChat] VRChat credentials not set in environment variables. Skipping VRChat login.",
      );
    } else {
      try {
        const user = await loginAndGetCurrentUser(vrcUsername, vrcPassword);
        console.log(
          `[VRChat] VRChat login successful:  ${user.displayName} | ${user.username} | ${user.id}`,
        );
      } catch (err) {
        console.error("[VRChat] VRChat login failed:", err);
      }
    }
  } catch (error) {
    console.error("[VRChat] Failed to initialize application commands:", error);
  }

  console.log("[Schedules] Initializing schedules...");
  initializeSchedules(bot);
  console.log("[Schedules] Schedules initialized.");

  // Initialize Patrol Timer after bot is ready
  console.log("[PatrolTimer] Initializing patrol timer...");
  await patrolTimer.init();
  console.log("[PatrolTimer] Patrol timer initialized.");

  const vrchatIsRunning = await isLoggedInAndVerified();
  if (vrchatIsRunning) {
    console.log("[VRChat] VRChat is running");
    startVRChatWebSocketListener();
    // Invite message sync removed - not in use
    // syncAllInviteMessages().catch((err) => {
    //   console.error("[VRChat] Failed to sync invite messages:", err);
    // });
  } else {
    console.log("[VRChat] VRChat is not running");
  }
});

bot.on("interactionCreate", async (interaction: Interaction) => {
  try {
    await bot.executeInteraction(interaction);
  } catch (error) {
    console.error("[Bot] Error handling interaction:", error);
    // Try to respond if interaction hasn't been responded to
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "❌ An error occurred while processing your request.",
          ephemeral: true,
        });
      } catch (replyError) {
        // Ignore errors from trying to reply (might be too late)
        console.error("[Bot] Failed to send error reply:", replyError);
      }
    }
  }
});

bot.on("messageCreate", async (message: Message) => {
  try {
    await bot.executeCommand(message);
  } catch (error) {
    console.error("[Bot] Error handling message:", error);
  }
});

async function run() {
  await importx(
    `${dirname(import.meta.url)}/{events,commands,api}/**/*.{ts,js}`,
  );

  if (!process.env.BOT_TOKEN) {
    throw Error(
      "Bot token missing. Please check you have included it in the .env file. Required field: BOT_TOKEN=xxx",
    );
  }

  await bot.login(process.env.BOT_TOKEN);

  const server = new Koa();
  server.use(multer().single("file"));
  server.use(bodyParser());
  await server.build();

  const port = process.env.PORT ?? 3000;
  server.listen(port, () => {
    console.log(`Running On Port: ${port}`);
  });
}

// Graceful shutdown handler
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`\n[Shutdown] Received ${signal}, shutting down gracefully...`);

  try {
    // Stop WebSocket listener
    stopVRChatWebSocketListener();
    console.log("[Shutdown] WebSocket listener stopped");

    // Cleanup managers
    whitelistManager.cleanup();
    console.log("[Shutdown] Managers cleaned up");

    // Disconnect bot
    if (bot.isReady()) {
      bot.destroy();
      console.log("[Shutdown] Discord bot disconnected");
    }

    // Close database connection
    await prisma.$disconnect();
    console.log("[Shutdown] Database connection closed");

    console.log("[Shutdown] Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("[Shutdown] Error during shutdown:", error);
    process.exit(1);
  }
}

// Track uncaught exceptions to prevent infinite loops
let uncaughtExceptionCount = 0;
let lastUncaughtExceptionTime = 0;
const MAX_UNCAUGHT_EXCEPTIONS = 5;
const EXCEPTION_RESET_TIME = 60000; // 1 minute

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Log but don't crash - let the bot continue running
});

process.on("uncaughtException", (error) => {
  const now = Date.now();
  
  // Reset counter if enough time has passed
  if (now - lastUncaughtExceptionTime > EXCEPTION_RESET_TIME) {
    uncaughtExceptionCount = 0;
  }
  
  uncaughtExceptionCount++;
  lastUncaughtExceptionTime = now;
  
  console.error(`[Uncaught Exception #${uncaughtExceptionCount}]`, error);
  console.error("Stack trace:", error.stack);
  
  // Only shutdown if we're getting too many exceptions in a short time (likely infinite loop)
  if (uncaughtExceptionCount >= MAX_UNCAUGHT_EXCEPTIONS) {
    console.error(
      `[Fatal] Too many uncaught exceptions (${uncaughtExceptionCount}) in a short period. Shutting down to prevent infinite loop.`
    );
    gracefulShutdown("uncaughtException").catch(() => {
      process.exit(1);
    });
  } else {
    console.warn(
      `[Warning] Bot will continue running despite uncaught exception. This may lead to unstable behavior.`
    );
    // Bot continues running - don't exit
  }
});

// Handle termination signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

run().catch((error) => {
  console.error("[Startup] Fatal error during startup:", error);
  process.exit(1);
});
