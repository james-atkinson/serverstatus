import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { config } from "../config/env.js";

const execFileAsync = promisify(execFile);
const pingDebugEnabled = String(process.env.PING_DEBUG || "").toLowerCase() === "true";

const logPing = (message, payload = null) => {
  if (!pingDebugEnabled) return;
  if (payload) {
    console.log(`[ping-debug] ${message}`, payload);
    return;
  }
  console.log(`[ping-debug] ${message}`);
};

const normalizePingTarget = (target) => {
  const raw = String(target || "").trim();
  if (!raw) return "";
  if (raw.includes("://")) {
    try {
      return new URL(raw).hostname || raw;
    } catch {
      return raw;
    }
  }
  return raw.replace(/^\/+|\/+$/g, "");
};

const parsePing = (output) => {
  const lossMatch = output.match(/([0-9.]+)%\s+packet loss/);
  const latencyMatch = output.match(/=\s*[0-9.]+\/([0-9.]+)\/[0-9.]+\/[0-9.]+\s*ms/);
  return {
    packetLossPct: lossMatch ? Number(lossMatch[1]) : null,
    latencyMs: latencyMatch ? Number(latencyMatch[1]) : null
  };
};

export const runPingChecks = async () => {
  const now = new Date().toISOString();
  logPing("starting ping checks", { targets: config.pingTargets, ts: now });
  const results = await Promise.all(
    config.pingTargets.map(async (target) => {
      const pingTarget = normalizePingTarget(target);
      try {
        const { stdout, stderr } = await execFileAsync("ping", ["-c", "4", "-q", pingTarget], {
          timeout: 10000
        });
        const parsed = parsePing([stdout, stderr].filter(Boolean).join("\n"));
        const packetLossPct = parsed.packetLossPct ?? 0;
        logPing("ping command success", {
          target,
          pingTarget,
          latencyMs: parsed.latencyMs,
          packetLossPct,
          raw: [stdout, stderr].filter(Boolean).join("\n")
        });
        return {
          ts: now,
          target,
          latencyMs: parsed.latencyMs,
          packetLossPct,
          success: packetLossPct < 100
        };
      } catch (error) {
        logPing("ping command failed", {
          target,
          pingTarget,
          message: error?.message || "unknown error",
          code: error?.code || null,
          stdout: error?.stdout || null,
          stderr: error?.stderr || null
        });
        return {
          ts: now,
          target,
          latencyMs: null,
          packetLossPct: 100,
          success: false
        };
      }
    })
  );
  const up = results.filter((entry) => entry.success).length;
  logPing("completed ping checks", {
    total: results.length,
    up,
    down: results.length - up,
    results
  });
  return results;
};

export const runSpeedTest = async () => {
  const startedAt = Date.now();
  const downloadUrl = process.env.SPEEDTEST_DOWNLOAD_URL || "https://speed.cloudflare.com/__down?bytes=25000000";
  const uploadUrl = process.env.SPEEDTEST_UPLOAD_URL || "https://speed.cloudflare.com/__up";

  const downloadResponse = await fetch(downloadUrl, { method: "GET" });
  if (!downloadResponse.ok || !downloadResponse.body) {
    throw new Error(`Download probe failed: ${downloadResponse.status}`);
  }

  let downloadedBytes = 0;
  const reader = downloadResponse.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    downloadedBytes += value.byteLength;
  }
  const downloadDurationSec = (Date.now() - startedAt) / 1000;
  const downloadMbps = downloadDurationSec > 0 ? (downloadedBytes * 8) / downloadDurationSec / 1_000_000 : null;

  const payload = randomBytes(2_000_000);
  const uploadStart = Date.now();
  let uploadMbps = null;
  try {
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: payload
    });
    if (uploadResponse.ok) {
      const uploadDurationSec = (Date.now() - uploadStart) / 1000;
      uploadMbps = uploadDurationSec > 0 ? (payload.byteLength * 8) / uploadDurationSec / 1_000_000 : null;
    }
  } catch {
    uploadMbps = null;
  }

  const pingProbeStart = Date.now();
  await fetch("https://1.1.1.1/cdn-cgi/trace", { method: "GET" });
  const pingMs = Date.now() - pingProbeStart;

  return {
    ts: new Date().toISOString(),
    downloadMbps: downloadMbps ? Number(downloadMbps.toFixed(2)) : null,
    uploadMbps: uploadMbps ? Number(uploadMbps.toFixed(2)) : null,
    pingMs: Number(pingMs.toFixed(2)),
    jitterMs: null,
    serverName: "Cloudflare probe"
  };
};
