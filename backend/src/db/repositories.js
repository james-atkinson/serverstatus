import { readStore, writeStore } from "./sqlite.js";

const RETENTION_DAYS = 40;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

const pruneByTimestamp = (rows) => {
  const cutoff = Date.now() - RETENTION_MS;
  return rows.filter((row) => {
    const ts = Date.parse(row?.ts || "");
    return Number.isFinite(ts) && ts >= cutoff;
  });
};

export const saveServiceChecks = async (checks) => {
  writeStore((store) => {
    for (const row of checks) {
      store.counters.service_checks += 1;
      store.service_checks.push({
        id: store.counters.service_checks,
        ts: row.checkedAt,
        service_name: row.serviceName,
        status: row.status,
        response_ms: row.responseMs,
        error_text: row.errorText
      });
    }
    store.service_checks = pruneByTimestamp(store.service_checks);
  });
};

export const saveNetworkChecks = async (checks) => {
  writeStore((store) => {
    for (const row of checks) {
      store.counters.network_checks += 1;
      store.network_checks.push({
        id: store.counters.network_checks,
        ts: row.ts,
        target: row.target,
        latency_ms: row.latencyMs,
        packet_loss_pct: row.packetLossPct,
        success: row.success ? 1 : 0
      });
    }
    store.network_checks = pruneByTimestamp(store.network_checks);
  });
};

export const saveSpeedTest = async (result) => {
  writeStore((store) => {
    store.counters.speed_tests += 1;
    store.speed_tests.push({
      id: store.counters.speed_tests,
      ts: result.ts,
      download_mbps: result.downloadMbps,
      upload_mbps: result.uploadMbps,
      ping_ms: result.pingMs,
      jitter_ms: result.jitterMs,
      server_name: result.serverName
    });
    store.speed_tests = pruneByTimestamp(store.speed_tests);
  });
};

export const latestServiceChecks = async () => {
  const rows = readStore().service_checks;
  const map = new Map();
  for (const row of rows) {
    const current = map.get(row.service_name);
    if (!current || row.id > current.id) map.set(row.service_name, row);
  }
  return Array.from(map.values())
    .sort((a, b) => a.service_name.localeCompare(b.service_name))
    .map((row) => ({
      serviceName: row.service_name,
      status: row.status,
      responseMs: row.response_ms,
      errorText: row.error_text,
      checkedAt: row.ts
    }));
};

export const latestNetworkChecks = async () => {
  const rows = readStore().network_checks;
  const map = new Map();
  for (const row of rows) {
    const current = map.get(row.target);
    if (!current || row.id > current.id) map.set(row.target, row);
  }
  return Array.from(map.values())
    .sort((a, b) => a.target.localeCompare(b.target))
    .map((row) => ({
      ts: row.ts,
      target: row.target,
      latencyMs: row.latency_ms,
      packetLossPct: row.packet_loss_pct,
      success: row.success
    }));
};

export const latestSpeedTest = async () => {
  const rows = readStore().speed_tests;
  const row = rows.length ? rows[rows.length - 1] : null;
  if (!row) return null;
  return {
    ts: row.ts,
    downloadMbps: row.download_mbps,
    uploadMbps: row.upload_mbps,
    pingMs: row.ping_ms,
    jitterMs: row.jitter_ms,
    serverName: row.server_name
  };
};

export const networkHistory = (hours = 24) => {
  const fromDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const rows = readStore().network_checks
    .filter((row) => row.ts >= fromDate)
    .sort((a, b) => a.ts.localeCompare(b.ts));
  return Promise.resolve(
    rows.map((row) => ({
      ts: row.ts,
      target: row.target,
      latencyMs: row.latency_ms,
      packetLossPct: row.packet_loss_pct,
      success: row.success
    }))
  );
};

export const speedHistory = (hours = 24) => {
  const fromDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const rows = readStore().speed_tests
    .filter((row) => row.ts >= fromDate)
    .sort((a, b) => a.ts.localeCompare(b.ts));
  return Promise.resolve(
    rows.map((row) => ({
      ts: row.ts,
      downloadMbps: row.download_mbps,
      uploadMbps: row.upload_mbps,
      pingMs: row.ping_ms,
      jitterMs: row.jitter_ms,
      serverName: row.server_name
    }))
  );
};
