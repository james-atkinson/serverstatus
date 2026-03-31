import os from "node:os";
import fs from "node:fs/promises";
import si from "systeminformation";
import { config } from "../config/env.js";

const pickPrimaryNic = (stats) => {
  if (!Array.isArray(stats) || !stats.length) return null;
  const nonLoopback = stats.filter((entry) => entry.iface && entry.iface !== "lo" && !entry.iface.startsWith("lo"));
  return nonLoopback[0] || stats[0] || null;
};

export const getSystemHealth = async () => {
  const [cpuLoad, mem, fsSize, disksIo, netStats, osInfo] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.disksIO(),
    si.networkStats(),
    si.osInfo()
  ]);

  const configuredFs = new Set(config.monitoredFilesystems || []);
  const allFilesystems = fsSize.map((entry) => ({
    fs: entry.fs || entry.mount || "unknown",
    mount: entry.mount || "",
    total: entry.size,
    used: entry.used,
    free: Math.max(0, entry.size - entry.used),
    usePct: Number((entry.use ?? ((entry.used / entry.size) * 100)).toFixed(2))
  }));

  const filesystemMonitors = allFilesystems
    .filter((entry) => !configuredFs.size || configuredFs.has(entry.fs))
    .map((entry) => ({
      id: `fs:${entry.fs}`,
      label: entry.fs,
      path: entry.mount || entry.fs,
      ...entry
    }));

  const mountCandidates = allFilesystems.slice().sort((a, b) => (b.mount || "").length - (a.mount || "").length);
  const pathMonitors = await Promise.all(
    (config.monitoredPaths || []).map(async (targetPath) => {
      const matched = mountCandidates.find((entry) => {
        const mount = entry.mount || "/";
        return targetPath === mount || targetPath.startsWith(`${mount}/`) || (mount === "/" && targetPath.startsWith("/"));
      });
      try {
        const stat = await fs.statfs(targetPath);
        const blockSize = Number(stat.bsize || stat.frsize || 0);
        const total = Number(stat.blocks || 0) * blockSize;
        const free = Number(stat.bavail || stat.bfree || 0) * blockSize;
        const used = Math.max(0, total - free);
        const usePct = total > 0 ? Number(((used / total) * 100).toFixed(2)) : 0;
        return {
          id: `path:${targetPath}`,
          label: targetPath,
          path: targetPath,
          fs: matched?.fs || "unknown",
          mount: matched?.mount || "",
          total,
          used,
          free,
          usePct
        };
      } catch {
        if (!matched) {
          return {
            id: `path:${targetPath}`,
            label: targetPath,
            path: targetPath,
            fs: "unknown",
            mount: "",
            total: 0,
            used: 0,
            free: 0,
            usePct: 0
          };
        }
        return {
          id: `path:${targetPath}`,
          label: targetPath,
          path: targetPath,
          fs: matched.fs,
          mount: matched.mount,
          total: matched.total,
          used: matched.used,
          free: matched.free,
          usePct: matched.usePct
        };
      }
    })
  );

  const filesystems = [...filesystemMonitors, ...pathMonitors];

  const primaryNic = pickPrimaryNic(netStats);

  return {
    hostname: os.hostname(),
    uptimeSec: os.uptime(),
    lastBootAt: new Date(Date.now() - os.uptime() * 1000).toISOString(),
    kernelVersion: osInfo?.kernel || os.release(),
    loadAvg: os.loadavg(),
    cpuUsagePct: Number(cpuLoad.currentLoad.toFixed(2)),
    memory: {
      total: mem.total,
      used: mem.used,
      free: mem.free
    },
    diskIo: {
      readBytesSec: Number(disksIo?.rIO_sec || 0),
      writeBytesSec: Number(disksIo?.wIO_sec || 0),
      tps: Number(disksIo?.tIO_sec || 0)
    },
    network: {
      iface: primaryNic?.iface || null,
      rxBytesSec: Number(primaryNic?.rx_sec || 0),
      txBytesSec: Number(primaryNic?.tx_sec || 0),
      rxDropped: Number(primaryNic?.rx_dropped || 0),
      txDropped: Number(primaryNic?.tx_dropped || 0),
      rxErrors: Number(primaryNic?.rx_errors || 0),
      txErrors: Number(primaryNic?.tx_errors || 0)
    },
    filesystems
  };
};
