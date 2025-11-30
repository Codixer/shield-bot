import { Client } from "discord.js";
import { loggers } from "../utility/logger.js";

export function initializeSchedules(_client: Client) {
  loggers.schedules.info("No scheduled tasks to initialize.");
}

export function stopSchedules() {
  loggers.schedules.info("No scheduled tasks to stop.");
}
