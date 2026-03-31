import { Router } from "express";
import axios from "axios";
import { getSystemHealth } from "../services/systemHealth.js";
import { getConfiguredServices } from "../services/mediaServices.js";
import { getMediaSummary } from "../services/mediaSummary.js";
import { config, services } from "../config/env.js";
import { checkPlexDeviceAuthStatus, getPlexAuthState, startPlexDeviceAuth } from "../services/plexAuth.js";
import { getPlexHistory, getPlexNowPlaying } from "../services/plexData.js";
import { getPlexConnection } from "../services/plexAuth.js";
import { runSpeedTest } from "../services/networkTelemetry.js";
import {
  latestNetworkChecks,
  latestServiceChecks,
  latestSpeedTest,
  networkHistory,
  saveSpeedTest,
  speedHistory
} from "../db/repositories.js";

const asHours = (range) => {
  if (range === "7d") return 24 * 7;
  if (range === "30d") return 24 * 30;
  return 24;
};

export const apiRouter = Router();

apiRouter.get("/health/system", async (_req, res, next) => {
  try {
    res.json(await getSystemHealth());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/health/services", async (_req, res, next) => {
  try {
    const [checks, configured] = await Promise.all([latestServiceChecks(), Promise.resolve(getConfiguredServices())]);
    const configuredByName = new Map(configured.map((service) => [service.name, service]));
    const merged = checks.map((check) => {
      const matched = configuredByName.get(check.serviceName);
      return {
        ...check,
        id: matched?.id || null,
        appUrl: matched?.url || null,
        enabled: matched?.enabled ?? true
      };
    });
    res.json(merged);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/media/summary", async (_req, res, next) => {
  try {
    res.json(await getMediaSummary());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/media/sonarr/art", async (req, res, next) => {
  try {
    const artPath = String(req.query.path || "");
    if (!artPath || !artPath.startsWith("/")) {
      res.status(400).json({ error: "Invalid art path" });
      return;
    }

    const sonarr = services.find((service) => service.id === "sonarr");
    if (!sonarr?.enabled) {
      res.status(404).json({ error: "Sonarr is not configured" });
      return;
    }

    const response = await axios.get(`${sonarr.url}${artPath}`, {
      headers: { "X-Api-Key": sonarr.token },
      responseType: "arraybuffer",
      timeout: 8000
    });
    res.setHeader("content-type", response.headers["content-type"] || "image/jpeg");
    res.setHeader("cache-control", "public, max-age=300");
    res.send(Buffer.from(response.data));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/media/radarr/art", async (req, res, next) => {
  try {
    const artPath = String(req.query.path || "");
    if (!artPath || !artPath.startsWith("/")) {
      res.status(400).json({ error: "Invalid art path" });
      return;
    }

    const radarr = services.find((service) => service.id === "radarr");
    if (!radarr?.enabled) {
      res.status(404).json({ error: "Radarr is not configured" });
      return;
    }

    const response = await axios.get(`${radarr.url}${artPath}`, {
      headers: { "X-Api-Key": radarr.token },
      responseType: "arraybuffer",
      timeout: 8000
    });
    res.setHeader("content-type", response.headers["content-type"] || "image/jpeg");
    res.setHeader("cache-control", "public, max-age=300");
    res.send(Buffer.from(response.data));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/network/current", async (_req, res, next) => {
  try {
    const [checks, speed] = await Promise.all([latestNetworkChecks(), latestSpeedTest()]);
    const configuredTargets = new Set(config.pingTargets);
    const filteredChecks = checks.filter((check) => configuredTargets.has(check.target));
    res.json({ checks: filteredChecks, speed });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/network/history", async (req, res, next) => {
  try {
    const hours = asHours(req.query.range);
    const [checks, speed] = await Promise.all([networkHistory(hours), speedHistory(hours)]);
    const configuredTargets = new Set(config.pingTargets);
    const filteredChecks = checks.filter((check) => configuredTargets.has(check.target));
    const successes = filteredChecks.filter((entry) => entry.success).length;
    const uptimePct = filteredChecks.length ? Number(((successes / filteredChecks.length) * 100).toFixed(2)) : null;
    res.json({
      network: filteredChecks,
      speed,
      uptimePct
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/network/speedtest", async (_req, res, next) => {
  try {
    const result = await runSpeedTest();
    await saveSpeedTest(result);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/meta/configured-services", (_req, res) => {
  res.json(getConfiguredServices());
});

apiRouter.get("/meta/effective-config", (_req, res) => {
  res.json({
    port: config.port,
    checkIntervalSec: config.checkIntervalSec,
    speedtestIntervalMin: config.speedtestIntervalMin,
    pingTargets: config.pingTargets,
    services: getConfiguredServices().map((service) => ({
      id: service.id,
      url: service.url,
      enabled: service.enabled
    }))
  });
});

apiRouter.post("/plex/auth/start", async (_req, res, next) => {
  try {
    res.json(await startPlexDeviceAuth());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/plex/auth/status", async (req, res, next) => {
  try {
    const pinId = String(req.query.pinId || "");
    if (!pinId) {
      res.status(400).json({ error: "pinId is required" });
      return;
    }
    res.json(await checkPlexDeviceAuthStatus(pinId));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/plex/auth/state", (_req, res) => {
  res.json(getPlexAuthState());
});

apiRouter.get("/plex/now-playing", async (_req, res, next) => {
  try {
    res.json(await getPlexNowPlaying());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/plex/history", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit || 20);
    res.json(await getPlexHistory(limit));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/plex/art", async (req, res, next) => {
  try {
    const artPath = String(req.query.path || "");
    if (!artPath || !artPath.startsWith("/")) {
      res.status(400).json({ error: "Invalid art path" });
      return;
    }
    const connection = getPlexConnection();
    if (!connection) {
      res.status(404).json({ error: "Plex is not connected" });
      return;
    }
    const response = await axios.get(`${connection.url}${artPath}`, {
      headers: { "X-Plex-Token": connection.token },
      params: { "X-Plex-Token": connection.token },
      responseType: "arraybuffer",
      timeout: 10000
    });
    res.setHeader("content-type", response.headers["content-type"] || "image/jpeg");
    res.setHeader("cache-control", "public, max-age=300");
    res.send(Buffer.from(response.data));
  } catch (error) {
    next(error);
  }
});
