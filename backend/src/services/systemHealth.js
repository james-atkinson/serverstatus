import os from "node:os";
import si from "systeminformation";

export const getSystemHealth = async () => {
  const [cpuLoad, mem, fsSize] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize()
  ]);

  const minFilesystemSizeBytes = 1024 * 1024 * 1024;
  const filesystems = fsSize
    .filter((entry) => Number(entry.size) > minFilesystemSizeBytes)
    .map((entry) => ({
      fs: entry.fs || entry.mount || "unknown",
      mount: entry.mount || "",
      total: entry.size,
      used: entry.used,
      free: Math.max(0, entry.size - entry.used),
      usePct: Number((entry.use ?? ((entry.used / entry.size) * 100)).toFixed(2))
    }));

  const diskTotals = fsSize.reduce(
    (acc, entry) => {
      acc.total += entry.size;
      acc.used += entry.used;
      return acc;
    },
    { total: 0, used: 0 }
  );

  return {
    hostname: os.hostname(),
    uptimeSec: os.uptime(),
    loadAvg: os.loadavg(),
    cpuUsagePct: Number(cpuLoad.currentLoad.toFixed(2)),
    memory: {
      total: mem.total,
      used: mem.used,
      free: mem.free
    },
    disk: {
      total: diskTotals.total,
      used: diskTotals.used,
      free: Math.max(0, diskTotals.total - diskTotals.used)
    },
    filesystems
  };
};
