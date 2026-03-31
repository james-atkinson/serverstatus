import os from "node:os";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import si from "systeminformation";
import { config } from "../config/env.js";

const execFileAsync = promisify(execFile);

const pickPrimaryNic = (stats) => {
  if (!Array.isArray(stats) || !stats.length) return null;
  const nonLoopback = stats.filter((entry) => entry.iface && entry.iface !== "lo" && !entry.iface.startsWith("lo"));
  return nonLoopback[0] || stats[0] || null;
};

const getDirectorySizeBytes = async (targetPath) => {
  try {
    const { stdout } = await execFileAsync("du", ["-sk", "--", targetPath]);
    const sizeInKiB = Number.parseInt((stdout || "").trim().split(/\s+/)[0], 10);
    if (!Number.isFinite(sizeInKiB) || sizeInKiB < 0) return null;
    return sizeInKiB * 1024;
  } catch {
    return null;
  }
};

const getFilesystemUsageFromPath = async (targetPath) => {
  try {
    const stat = await fs.statfs(targetPath);
    const blockSize = Number(stat.bsize || stat.frsize || 0);
    const total = Number(stat.blocks || 0) * blockSize;
    const free = Number(stat.bavail || stat.bfree || 0) * blockSize;
    const used = Math.max(0, total - free);
    const usePct = total > 0 ? Number(((used / total) * 100).toFixed(2)) : 0;
    return { total, used, free, usePct };
  } catch {
    return null;
  }
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

  const monitoredFilesystemPaths = config.monitoredFilesystemPaths || {};
  const configuredFs = new Set(Object.keys(monitoredFilesystemPaths));
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
      ...entry,
      paths: []
    }));

  const mountCandidates = allFilesystems.slice().sort((a, b) => (b.mount || "").length - (a.mount || "").length);
  const pathMonitors = await Promise.all(
    Object.entries(monitoredFilesystemPaths).flatMap(([filesystemName, paths]) =>
      (paths || []).map(async (targetPath) => {
        const matched = mountCandidates.find((entry) => {
          const mount = entry.mount || "/";
          return (
            targetPath === mount ||
            targetPath.startsWith(`${mount}/`) ||
            (mount === "/" && targetPath.startsWith("/"))
          );
        });
        const directoryBytes = await getDirectorySizeBytes(targetPath);
        const configuredFilesystem = allFilesystems.find((entry) => entry.fs === filesystemName);
        const usageFromPath = await getFilesystemUsageFromPath(targetPath);
        const total = configuredFilesystem?.total || usageFromPath?.total || matched?.total || 0;

        return {
          id: `path:${filesystemName}:${targetPath}`,
          label: targetPath,
          path: targetPath,
          fs: filesystemName,
          mount: configuredFilesystem?.mount || matched?.mount || "",
          filesystemTotal: usageFromPath?.total || 0,
          filesystemUsed: usageFromPath?.used || 0,
          filesystemFree: usageFromPath?.free || 0,
          filesystemUsePct: usageFromPath?.usePct || 0,
          directoryBytes,
          usePctOfFilesystem: total && directoryBytes !== null ? Number(((directoryBytes / total) * 100).toFixed(2)) : 0
        };
      })
    )
  );

  const fsByName = new Map(filesystemMonitors.map((entry) => [entry.fs, entry]));
  for (const pathMonitor of pathMonitors) {
    if (!fsByName.has(pathMonitor.fs)) {
      const fallback = allFilesystems.find((entry) => entry.fs === pathMonitor.fs);
      const dynamicFs = {
        id: `fs:${pathMonitor.fs}`,
        label: pathMonitor.fs,
        path: fallback?.mount || pathMonitor.mount || pathMonitor.fs,
        fs: pathMonitor.fs,
        mount: fallback?.mount || pathMonitor.mount || "",
        total: fallback?.total || pathMonitor.filesystemTotal || 0,
        used: fallback?.used || pathMonitor.filesystemUsed || 0,
        free: fallback?.free || pathMonitor.filesystemFree || 0,
        usePct: fallback?.usePct || pathMonitor.filesystemUsePct || 0,
        paths: []
      };
      fsByName.set(pathMonitor.fs, dynamicFs);
    }
    fsByName.get(pathMonitor.fs).paths.push(pathMonitor);
  }

  const filesystems = Array.from(fsByName.values());

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
