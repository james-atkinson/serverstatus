import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { APP_DEFAULTS, SERVICE_DEFAULTS } from "./defaults.js";

const envCandidates = [
  path.resolve(process.cwd(), "../.env"),
  path.resolve(process.cwd(), ".env")
];

for (const candidate of envCandidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false });
  }
}

const asInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ensureHttpUrl = (value, key) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid protocol");
    }
    return value.replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid URL for ${key}: ${value}`);
  }
};

export const config = {
  port: asInt(process.env.PORT, APP_DEFAULTS.PORT),
  sqlitePath: process.env.SQLITE_PATH || APP_DEFAULTS.SQLITE_PATH,
  checkIntervalSec: asInt(process.env.CHECK_INTERVAL_SEC, APP_DEFAULTS.CHECK_INTERVAL_SEC),
  speedtestIntervalMin: asInt(process.env.SPEEDTEST_INTERVAL_MIN, APP_DEFAULTS.SPEEDTEST_INTERVAL_MIN),
  pingTargets: (process.env.PING_TARGETS || APP_DEFAULTS.PING_TARGETS)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
};

export const services = Object.entries(SERVICE_DEFAULTS).map(([key, spec]) => {
  const urlEnv = `${key.toUpperCase()}_URL`;
  const serviceUrl = process.env[urlEnv] || spec.url;
  const token = process.env[spec.envKey] || "";

  return {
    id: key,
    name: spec.name,
    type: spec.type,
    url: ensureHttpUrl(serviceUrl, urlEnv),
    authEnvKey: spec.envKey,
    token,
    enabled: Boolean(token)
  };
});

export const validateConfig = () => {
  if (!config.pingTargets.length) {
    throw new Error("PING_TARGETS must include at least one host");
  }
};
