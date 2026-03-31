import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { config } from "../config/env.js";

const execFileAsync = promisify(execFile);

const parsePing = (stdout) => {
  const lossMatch = stdout.match(/([0-9.]+)% packet loss/);
  const latencyMatch = stdout.match(/=\s*[0-9.]+\/([0-9.]+)\/[0-9.]+\/[0-9.]+\s*ms/);
  return {
    packetLossPct: lossMatch ? Number(lossMatch[1]) : 100,
    latencyMs: latencyMatch ? Number(latencyMatch[1]) : null
  };
};

export const runPingChecks = async () => {
  const now = new Date().toISOString();
  const results = await Promise.all(
    config.pingTargets.map(async (target) => {
      try {
        const { stdout } = await execFileAsync("ping", ["-c", "4", "-q", target], {
          timeout: 10000
        });
        const parsed = parsePing(stdout);
        return {
          ts: now,
          target,
          latencyMs: parsed.latencyMs,
          packetLossPct: parsed.packetLossPct,
          success: parsed.packetLossPct < 100
        };
      } catch {
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
