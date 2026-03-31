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

const parseCsv = (value) =>
  (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseMonitoredFilesystemPaths = () => {
  const raw =
    process.env.MONITORED_FILESYSTEM_PATHS ||
    process.env.MONITORED_FILESYSTEMS_MAP ||
    APP_DEFAULTS.MONITORED_FILESYSTEM_PATHS;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("must be a JSON object");
    }
    const normalized = Object.fromEntries(
      Object.entries(parsed)
        .map(([fsName, paths]) => [
          String(fsName).trim(),
          Array.isArray(paths) ? paths.map((entry) => String(entry).trim()).filter(Boolean) : []
        ])
        .filter(([fsName]) => Boolean(fsName))
    );
    return normalized;
  } catch {
    const fallbackFilesystems = parseCsv(process.env.MONITORED_FILESYSTEMS || APP_DEFAULTS.MONITORED_FILESYSTEMS);
    const fallbackPaths = parseCsv(process.env.MONITORED_PATHS || APP_DEFAULTS.MONITORED_PATHS);
    if (!fallbackFilesystems.length) return {};
    return Object.fromEntries(
      fallbackFilesystems.map((fsName, index) => [fsName, index === 0 ? fallbackPaths : []])
    );
  }
};

const monitoredFilesystemPaths = parseMonitoredFilesystemPaths();

export const config = {
  port: asInt(process.env.PORT, APP_DEFAULTS.PORT),
  sqlitePath: process.env.SQLITE_PATH || APP_DEFAULTS.SQLITE_PATH,
  checkIntervalSec: asInt(process.env.CHECK_INTERVAL_SEC, APP_DEFAULTS.CHECK_INTERVAL_SEC),
  speedtestIntervalMin: asInt(process.env.SPEEDTEST_INTERVAL_MIN, APP_DEFAULTS.SPEEDTEST_INTERVAL_MIN),
  monitoredFilesystemPaths,
  monitoredFilesystems: Object.keys(monitoredFilesystemPaths),
  monitoredPaths: Object.values(monitoredFilesystemPaths).flat(),
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
