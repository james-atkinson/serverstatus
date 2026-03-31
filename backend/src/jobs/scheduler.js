import cron from "node-cron";
import { config } from "../config/env.js";
import { checkServices } from "../services/mediaServices.js";
import { runPingChecks, runSpeedTest } from "../services/networkTelemetry.js";
import { saveNetworkChecks, saveServiceChecks, saveSpeedTest } from "../db/repositories.js";

const runServiceChecks = async () => {
  const checks = await checkServices();
  await saveServiceChecks(checks);
};

const runNetworkChecks = async () => {
  const checks = await runPingChecks();
  await saveNetworkChecks(checks);
};

const runSpeedChecks = async () => {
  try {
    const speed = await runSpeedTest();
    await saveSpeedTest(speed);
  } catch (error) {
    console.warn("speedtest failed:", error.message);
  }
};

export const startScheduler = async () => {
  await runServiceChecks();
  await runNetworkChecks();
  await runSpeedChecks();

  const checkMinutes = Math.max(1, Math.floor(config.checkIntervalSec / 60));
  const speedMinutes = Math.max(1, Math.floor(config.speedtestIntervalMin));
  cron.schedule(`*/${checkMinutes} * * * *`, runServiceChecks);
  cron.schedule(`*/${checkMinutes} * * * *`, runNetworkChecks);
  cron.schedule(`*/${speedMinutes} * * * *`, runSpeedChecks);
};
