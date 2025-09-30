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
import { PrismaClient } from "@prisma/client";
import { PatrolTimerManager } from "./managers/patrol/patrolTimerManager.js";
import {
  isLoggedInAndVerified,
  loginAndGetCurrentUser,
} from "./utility/vrchat.js";
import { startVRChatWebSocketListener } from "./events/vrchat/vrchat-websocket.js";
import {
  syncAllInviteMessages,
  syncInviteMessageIfDifferent,
} from "./managers/messages/InviteMessageManager.js";
import { initializeSchedules } from "./schedules/schedules.js";

export const prisma = new PrismaClient();

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
    syncAllInviteMessages();
  } else {
    console.log("[VRChat] VRChat is not running");
  }
});

bot.on("interactionCreate", async (interaction: Interaction) => {
  bot.executeInteraction(interaction);
});

bot.on("messageCreate", (message: Message) => {
  bot.executeCommand(message);
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

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Optionally, you can add logic to restart the bot or notify the admin
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception thrown:", error);
  // Optionally, you can add logic to restart the bot or notify the admin
});

run();
