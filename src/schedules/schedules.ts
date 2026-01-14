import { Client } from "discord.js";
import { loggers } from "../utility/logger.js";
import { initializePatrolTopSchedule, stopPatrolTopSchedule } from "./patrol/patrolTop.js";
import { initializeLOAExpirationSchedule, stopLOAExpirationSchedule } from "./loa/loaExpiration.js";
import * as cron from "node-cron";

let patrolTopJob: cron.ScheduledTask | null = null;
let loaExpirationJob: cron.ScheduledTask | null = null;

export function initializeSchedules(client: Client) {
  loggers.schedules.info("Initializing scheduled tasks...");

  // Initialize patrol top schedule
  patrolTopJob = initializePatrolTopSchedule(client);

  // Initialize LOA expiration schedule
  loaExpirationJob = initializeLOAExpirationSchedule(client);

  loggers.schedules.info("All scheduled tasks initialized.");
}

export function stopSchedules() {
  loggers.schedules.info("Stopping scheduled tasks...");

  // Stop patrol top schedule
  stopPatrolTopSchedule(patrolTopJob);
  patrolTopJob = null;

  // Stop LOA expiration schedule
  stopLOAExpirationSchedule(loaExpirationJob);
  loaExpirationJob = null;

  loggers.schedules.info("All scheduled tasks stopped.");
}
